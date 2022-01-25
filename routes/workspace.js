const fsp = require('fs').promises;
const path = require('path');
const util = require('util');

const express = require('express');
const router = express.Router();
const ejs = require('ejs');

const sessionManager = require('../session').sessionManager;
const dbPool = require('../lib/DBpool').dbPool;
const { BadRequestError, DBError, UnauthorizedError } = require('../lib/errors');


router.get('/makePage', async (request, response, next) => {
    
    const uid = request.session.uid;
    if(!uid) {
        return next(new DBError("Session has no uid", 401));
        // return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
    }

    let data;
    try {
        const fileName = path.join(__dirname, '../public/makePage.html');
        data = await fsp.readFile(fileName, { encoding: 'utf8' });
    } catch (err) {
        // internal server error (500)
        return next(err);
    }

    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end(data);
});

router.post('/make', async (request, response, next) => { // todo: Check the content source validation
    
    const uid = request.session.uid;
    if(!uid) {
        return next(new DBError("Session has no uid.", 401));
        // return next(new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`));
    }
    
    let { workspaceName, tags, source } = request.body;
    if(!workspaceName) {
        return next(new DBError("There is no Workspace name.", 400));
        // return next(new BadRequestError(`There is no Workspace name. request.body: ${util.inspect(request.body, true, 2, true)}`));
    }

    let tagArr = tags.split(',').map(tag => tag.trim());
	if(tagArr.length === 1 && tagArr[0] === '') {
		tagArr = [];
    }
    source = (source || '').replace(/'/g, `"`);
    let conn;
    try {

        conn = await dbPool.getConnection();
        await conn.beginTransaction();

        const res1 = await conn.query(`insert into t_workspace(name, created_date, owner, content) values(?, NOW(), ?, ?)`, [workspaceName, uid, source]);
        const res2 = await conn.query(`insert into t_participation(uid, wid, rid, bookmark, access_date) values(?, ?, 1, b'0', NULL)`, [uid, res1.insertId]);

        // Array of [wid, tag] pair
        if(tagArr.length > 0){
            const values = tagArr.map( tag => [res1.insertId, tag] );
            await conn.batch(`insert into t_tag(wid, name) values(?, ?)`, values);
        }
        
        conn.commit();
        conn.release();

    } catch (err) {
        if (conn) {
            conn.rollback();
            conn.release();
        }

        // conn error (500), transaction error (500), res1 error (500), res2 error (500), res3 error (500)
        return next(err);
    }

    response.status(200).end();
});

router.post('/removeWorkspace', async (request, response, next) => {
    
    const uid = request.session.uid;
    if(!uid) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    const wid = request.body.wid;
    if(!wid) {
        // return next(new AuthError(400));
        response.writeHead(400);
        response.end();
        return;
    }
	if(sessionManager.isLiveSession(parseInt(wid))) {
        // return next(new AuthError(400));
		response.writeHead(400);
		response.end('There is a running session');
		return;
	}

    let conn;
    try {
        conn = await dbPool.getConnection();

        const res1 = await conn.query(`select owner from t_workspace where id = ?`, wid);
        if(res1.length !== 1 || res1[0].owner !== uid) {
            throw new DBError('Unauthorized access', 403);     // The owner can remove only
        }

        await conn.query(`delete from t_workspace where id = ?`, wid);

        conn.release();

    } catch (err) {
        if (conn) {
            conn.release();
        }

        // conn error (500), res1 error (500), Unauthorized access(403), res2 error (500)
        return next(err);
    }

    response.status(200).end();
});


router.post('/setBookmark', async (request, response, next) => {
    
    const uid = request.session.uid;
    if(!uid) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    const wid = parseInt(request.body.wid);
    const val = parseInt(request.body.val);
    if(isNaN(wid) || isNaN(val) || val > 1 || val < 0) {
        // return next(new AuthError(400));
        response.writeHead(400);
        response.end();
        return;
    }

    let conn;
    try {
        conn = await dbPool.getConnection();
        
        const res1 = await conn.query(`update t_participation set bookmark=? where uid=? and wid=?`, [val, uid, wid]);
        if(res1.affectedRows !== 0) {
            throw new DBError('Unauthorized access', 412);     // You are not participant
        }
        
        conn.release();

    } catch (err) {
        if (conn) {
            conn.release();
        }

        // conn error (500), res1 error (500), Unauthorized access(412)
        return next(err);
    }

    response.status(200).end();
});

router.get('/wsList', async (request, response, next) => {
    
    const uid = request.session.uid;
    if(!uid) {
        const err = new UnauthorizedError(`Session has no uid. request.session: ${util.inspect(request.session, true, 2, true)}`);
        return next(err);
    }

    const parseBoolean = (x) => {
        if(x === 'false') return false;
        else if(x === 'true') return true;
        else return undefined;
    }
    // bmonly: bookmarkOnly
    let { page, rows, order, desc, bmonly, keyword } = request.query;
    [page, rows, order] = [page, rows, order].map( x => parseInt(x) );
    [desc, bmonly] = [desc, bmonly].map(parseBoolean);
    if(isNaN(page) || isNaN(rows) || isNaN(order) || order > 3 || desc === undefined || bmonly === undefined) {
        const err = new BadRequestError(`Invalid parameters - parameters: ${util.inspect({ page, rows, order, desc, bmonly, keyword }, true, 2, true)}`);
        return next(err);
    }
    
    const orderCols = ['name', 'size', 'access_date', 'owner_name'];
    let total = -1;
    let conn, res1;
    try {
        conn = await dbPool.getConnection();

        if(keyword) {
            res1 = await conn.query(`select SQL_CALC_FOUND_ROWS W.id, W.name, W.created_date, W.owner_name, (select count(*) from t_participation where wid = W.id) as size, PR.access_date, PR.role_name, PR.bookmark from ( select TMP.wid, TMP.bookmark, TMP.access_date, R.name as role_name from ( select * from t_participation where uid = ?${bmonly ? ' and bookmark=1' : ''}) as TMP join t_role as R on TMP.rid = R.id ) as PR join ( select U.name as owner_name, WS.id, WS.name, WS.description, WS.thumbnail, WS.created_date from t_workspace as WS join t_user as U on WS.owner = U.id ) as W on PR.wid = W.id where W.name like ? or W.id in (select distinct wid from t_tag where name = ?) order by ${orderCols[order] + (desc ? ' desc' : '')} limit ${String((page - 1) * rows)}, ${String(rows)}`, [uid, `%${keyword}%`, keyword]);
        }
        else {
            res1 = await conn.query(`select SQL_CALC_FOUND_ROWS W.id, W.name, W.created_date, W.owner_name, (select count(*) from t_participation where wid = W.id) as size, PR.access_date, PR.role_name, PR.bookmark from ( select TMP.wid, TMP.bookmark, TMP.access_date, R.name as role_name from ( select * from t_participation where uid = ?${bmonly ? ' and bookmark=1' : ''}) as TMP join t_role as R on TMP.rid = R.id ) as PR join ( select U.name as owner_name, WS.id, WS.name, WS.description, WS.thumbnail, WS.created_date from t_workspace as WS join t_user as U on WS.owner = U.id ) as W on PR.wid = W.id order by ${orderCols[order] + (desc ? ' desc' : '')} limit ${String((page - 1) * rows)}, ${String(rows)}`, uid);
        }
        const res2 = await conn.query(`select FOUND_ROWS() as total`);
        total = res2[0].total;

		for await (const tuple of res1) {
			try {
                const res3 = await conn.query(`select name from t_tag where wid = ?`, tuple.id);
                tuple.tags = res3.map( t => t.name );
			} catch(err) {
                // Cast error to upper try..catch.
                throw err;
			}
		}

        conn.release();

    } catch(err) {
        if (conn) {
            conn.release();
        }

        // conn error (500), res1 error (500), res2 error (500), res3 error (500)
        return next(err);
    }

    const result = res1;
    response.status(200).json({total, result});
});


router.post('/invite', async (request, response, next) => {
    
    const senderId = request.session.uid;
    if(!senderId) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    const { receiver, message, workspaceId } = request.body;
    if(!receiver || !workspaceId) {
        // return next(new AuthError(400));
        response.writeHead(400);
        response.end();
        return;
    }
    
    let conn;
    const field = (receiver.indexOf('@') === -1) ? 'name' : 'email';
    try {
        conn = await dbPool.getConnection();

        const res1 = await conn.query(`select count(*) as cnt from t_auth_role_relation where aid = 2 and rid = (select rid from t_participation where uid = ? and wid = ?)`, [senderId, workspaceId]);
        if(res1[0].cnt !== 1) {
            throw new DBError('Unauthorized access', 403);         // The user has no invite permission
        }

        const res2 = await conn.query(`select id from t_user where ${field} = ?`, receiver);
        if(res2.length !== 1) {
            throw new DBError('Invalid invitee', 412);         // The receiver does not exist
        }

        const receiverId = res2[0].id;
        const res3 = await conn.query(`select count(*) as cnt from t_participation where uid = ? and wid = ?`, [receiverId, workspaceId]);
        if(res3[0].cnt !== 0) {
            throw new DBError('Invitee already joined', 412);         // The receiver already participating
        }

        await conn.query(`insert into t_invite(sender_id, receiver_id, message, workspace_id, created_date) values(?, ?, ?, ?, NOW())`, [senderId, receiverId, message, workspaceId]);
        
        conn.release();

    } catch (err) {
        if (conn) {
            conn.release();
        }

        // conn error (500), res1 error (500), Unauthorized access (403), res2 error (500), Invalid invitee (412), res3 error (500), Invitee already joined (412), res4 error (500)
        return next(err);
    }

    response.status(200).end();
});

router.post('/join', async (request, response, next) => {
    
    const uid = request.session.uid;
    if(!uid) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    const iid = request.body.inviteId;
    if(!iid) {
        // return next(new AuthError(400));
        response.writeHead(400);
        response.end();
        return;
    }

    let conn;
    try {
        conn = await dbPool.getConnection();

        const res1 = await conn.query(`select * from t_invite where id = ? and receiver_id = ?`, [iid, uid]);
        if(res1.length !== 1) {
            throw new DBError('Unauthorized access', 412);     // You haven't been invited
        }

        const wid = result1[0].workspace_id;
        await conn.beginTransaction();

        await conn.query(`insert into t_participation(uid, wid, rid, bookmark) values(?, ?, 5, b'0')`, [uid, wid, iid]);
        await conn.query(`delete from t_invite where receiver_id = ? and workspace_id = ?`, [uid, wid]);

        conn.commit();
        conn.release();

    } catch (err) {
        if (conn) {
            conn.rollback();
            conn.release();
        }

        // conn error (500), res1 error (500), Unauthorized access (412), transaction error (500), res2 error (500)
        return next(err);
    }
    
    response.status(200).end();
});

router.post('/removeInvite', async (request, response, next) => {
    
    const uid = request.session.uid;
    if(!uid) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    const iid = request.body.inviteId;
    if(!iid) {
        // return next(new AuthError(400));
        response.writeHead(400);
        response.end();
        return;
    }

    let conn;
    try {
        conn = await dbPool.getConnection();

        const res1 = await conn.query(`select * from t_invite where id = ? and receiver_id = ?`, [iid, uid]);
        if(res1.length !== 1) {
            throw new DBError('Unauthorized access', 412);     // You haven't been invited
        }

        await conn.query(`delete from t_invite where id = ?`, iid);

        conn.release();

    } catch (err) {
        if (conn) {
            conn.release();
        }

        // conn error (500), res1 error (500), Unauthorized access (412), res2 error (500)
        return next(err);
    }

    response.status(200).end();
});

router.get('/manage', async (request, response, next) => {
    
    const uid = request.session.uid;
    if(!uid) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    const wid = request.query.id;
    if(!wid) {
        // return next(new AuthError(400));
        response.writeHead(400);
        response.end();
        return;
    }

    let conn;
    let manage, authority, spaceInform, tags;
    try {
        conn = await dbPool.getConnection();

        const res1 = await conn.query(`select aid from t_auth_role_relation where rid = (select rid from t_participation where uid = ? and wid = ?)`, [uid, wid]);
        if(res1.length === 0) {
            throw new DBError('Unauthorized access', 403);
        }
        
        authority = res1.map( auth => auth.aid );
        const hasAuth = authority.filter( i => (i === 1 || i === 3 || i === 4) ).length > 0;
        if(hasAuth) {
            const res2 = await conn.query(`select * from t_workspace where id = ?`, wid);
            if(res2.length === 0) {
                throw new DBError('Nonexistent workspace', 412);
            }

            res2[0].content = res2[0].content.replace(/"/g, `'`);
            spaceInform = res2[0];

            const res3 = await conn.query(`select name from t_tag where wid = ?`, wid);

            tags = res3.map( tag => tag.name ).join(', ');
            participant = await conn.query(`select U.id, U.name, U.email, P.rid from (select * from t_participation where wid = ?)  as P join t_user as U on P.uid = U.id`, wid);
            roleInform = await conn.query(`select * from t_role`);

            const fileName = path.join(__dirname, '../public/manage.ejs');
            manage = await fsp.readFile(fileName, { encoding: 'utf8' });
        }

        conn.release();

    } catch (err) {
        if (conn) {
            conn.release();
        }

        // conn error (500), res1 error (500), Unauthorized access (412), res2 error (500), Nonexistent workspace (412),
        // res3 error (500), res4 error (500), res5 error (500), file read error (500)
        return next(err);
    }

    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end(ejs.render(manage, { authority, spaceInform, tags, participant, roleInform }));
});

router.post('/alter', async (request, response, next) => { //todo: Check the content source validation
    
    const uid = request.session.uid;
    if(!uid) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    const { wid, wname } = request.body;
    if(!wid || !wname) {
        // return next(new AuthError(400));
        response.writeHead(400);
        response.end();
        return;
    }

	if(sessionManager.isLiveSession(parseInt(wid))) {
        // return next(new AuthError(400));
		response.writeHead(400);
		response.end('There is a running session');
		return;
	}

    let { tags, description, source } = request.body;
    let tagArr = (tags || '').split(',').map( tag => tag.trim() );
    if(tagArr.length === 1 && tagArr[0] === '') {
		tagArr = [];
    }
    description = description || '';
	source = (source || '').replace(/'/g, `"`);

    let conn;
    try {
        conn = await dbPool.getConnection();

        const res1 = await conn.query(`select aid from t_auth_role_relation where rid = (select rid from t_participation where uid = ? and wid = ?)`, [uid, wid]);
        const hasAlterAuth = res1.map( auth => auth.aid ).filter( aid => aid === 1 ).length > 0;
        if (!hasAlterAuth) {
            throw new DBError('Unauthorized access', 403);     // Has no privilege to workspace settings
        }

        await conn.beginTransaction();
        const res2 = await conn.query(`update t_workspace set name=?, description=?, content=? where id=?`, [wname, desc, source, wid]);
        const res3 = await conn.query(`delete from t_tag where wid = ?`, wid);

        // Array of [wid, tag] pair
        const values = tagArr.map( tag => [wid, tag] );
        await conn.batch(`insert into t_tag(wid, name) values(?, ?)`, values);

        conn.commit();
        conn.release();

    } catch (err) {
        if (conn) {
            conn.rollback();
            conn.release();
        }

        // conn error (500), res1 error (500), Unauthorized access (403), transaction error (500), res2 error (500),
        // res3 error (500), res4 error (500)
        return next(err);
    }

    response.status(200).end();
});

router.post('/leave', async (request, response, next) => {
    
    const uid = request.session.uid;
    if(!uid) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }
    
    const wid = request.body.wid;
    if(!wid) {
        // return next(new AuthError(400));
        response.writeHead(400);
        response.end();
        return;
    }

    let conn;
    try {
        conn = await dbPool.getConnection();
        const res1 = await conn.query(`select owner from t_workspace where id=?`, wid);

        let query, params;
        if(res1[0].owner === uid) {
            query = `delete from t_workspace where id=?`;
            params = wid;
        }
        else {
            query = `delete from t_participation where uid=? and wid=?`;
            params = [uid, wid];
        }
        await conn.query(query, params);
        conn.release();

    } catch (err) {
        if (conn) {
            conn.release();
        }

        // conn error (500), res1 error (500), res2 error (500)
        return next(err);
    }
    
    response.status(200).end();
});

router.post('/editParticipant', async (request, response, next) => {
    
    const uid = request.session.uid;
    if(!uid) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    let { wid, participant, role, type } = request.body;
    [wid, participant, role] = [wid, participant, role].map( x => parseInt(x) );
    if(isNaN(wid) || isNaN(participant) || (type === '1' && isNaN(role)) || (type !== '1' && type !== '2')) {
        // return next(new AuthError(400));
        response.writeHead(400);
        response.end();
        return;
    }

    let conn, result;
    try {
        conn = await dbPool.getConnection();

        const res1 = await conn.query(`select owner from t_workspace where id = ?`, wid);
        if(res1.length !== 1) {
            throw new DBError('Invalid workspace access', 412);        // The workspace does not exist
        }
        if(res1[0].owner === participant) {
            throw new DBError('Undefined work', 403);        // Owner cannot change himself
        }
        
        const res2 = await conn.query(`select aid from t_auth_role_relation where rid = (select rid from t_participation where uid=? and wid=?)`, [uid, wid]);
        const authority = res2.map( auth => auth.aid );

        const res3 = await conn.query(`select rid from t_participation where uid=? and wid=?`, [participant, wid]);
        if(res3.length !== 1) {
            throw new DBError('Unauthorized access', 412);        // The user is not participant
        }

        let authorize = false;
        const minRole = Math.min(res3[0].rid, role);
        if(minRole >= 4) {      //The user's role is writer or audience
            authorize = (authority.indexOf(4) !== -1);
        }
        else if(minRole >= 2) {     //The user's role is less than or equal to manager
            authorize = (authority.indexOf(3) !== -1);
        }
        else {      //The user's role is master
            authorize = (authority.indexOf(1) !== -1);
        }
        if(!authorize) {
            throw Error('Unexpected authorize level', 403);           // Cannot identify authorize level
        }

        let query, params;
        if(type === '1') {  //update
            query = `update t_participation set rid=? where uid=? and wid=?`;
            params = [role, participant, wid];
            result = {'uid': participant, 'rid': role};
        }
        else {  //delete
            query = `delete from t_participation where uid=? and wid=?`;
            params = [participant, wid];
            result = {'uid': participant};
        }
        await conn.query(query, params);
        conn.release();

    } catch (err) {
        if (conn) {
            conn.release();
        }

        // conn error (500), res1 error (500), Invalid workspace access (412), Undefined work (403), res2 error (500),
        // res3 error (500), Unexpected authorize level (403), res4 error (500)
        return next(err);
    }

    response.status(200).json(result);
});


router.post('/save', async (request, response, next) => {
    
    const uid = request.session.uid;
    if(!uid) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    const { wid, content, vrOptions, screenshot } = request.body;
    if(!wid || !content || !screenshot) {
        // return next(new AuthError(400));
        response.writeHead(400);
        response.end();
        return;
    }

    let conn;
    try {

        conn = await dbPool.getConnection();
        const res1 = await conn.query(`update t_workspace set content=?, vr_options=?, thumbnail=? where id = ?`, [content, vrOptions, screenshot, wid]);
        conn.release();

    } catch (err) {
        if (conn) {
            conn.release();
        }

        // conn error (500), res1 error (500)
        return next(err);
    }

    sessionManager.onSaved(uid, parseInt(wid));
    response.status(200).end();
});

module.exports = router;