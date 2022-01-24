const fsp = require('fs').promises;
const path = require('path');

const express = require('express');
const router = express.Router();
const ejs = require('ejs');

const dbPool = require('../lib/DBpool').dbPool;
const { DBError } = require('../lib/errors');


router.get('/', (request, response) => {
    
    const sess = request.session;
    if(!sess.uid) {
        return response.redirect('/loginPage');
    }

    return response.redirect('/main');
});

router.get('/loginPage', async (request, response, next) => {
    
    let data;
    try {
        const fileName = path.join(__dirname, '../public/loginPage.html');
        data = await fsp.readFile(fileName, { encoding: 'utf8' });

    } catch (err) {
        // internal server error (500)
        return next(err);
    }

    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end(data);
});

router.post('/register', async (request, response, next) => {
    
    const name = request.body.name;
    const email = request.body.email;
    const pw = request.body.pw1; 
    if(!name || !email || !pw) {
        // return next(new AuthError(400));
        response.writeHead(400);
        response.end();
        return;
    }
    
    let conn, uid;
    try{
        conn = await dbPool.getConnection();
        await conn.beginTransaction();

        const res1 = await conn.query(`insert into t_user(name, email, passwd, is_admin) values (?, ?, SHA2(?, 256), b'0')`, [name, email, pw]);
        const res2 = await conn.query(`insert into t_asset_item(name, owner_id, item_type) values (?, ?, b'0')`, [name, res1.insertId]);
        uid = res1.insertId;

        conn.commit();
        conn.release();

    } catch(err) {
        if (conn) {
            conn.rollback();
            conn.release();
        }

        // conn error (500), transaction error (500), res1 error (500), res2 error (500)
        return next(err);
    }

    request.session.uid = uid;
    request.session.name = name;
    request.session.email = email;
    request.session.is_admin = Buffer.alloc(1, 0x00);
    
    response.status(200).end();
});

router.post('/removeAccount', async (request, response, next) => {
    
    const uid = request.session.uid;
    if(!uid) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    let conn;
    try {
        conn = await dbPool.getConnection();
        await conn.query(`delete from t_user where id = ?`, [uid]);
        conn.release();

    } catch (err) {
        if (conn){
            conn.release();    
        }

        // conn error (500), query error (500)
        return next(err);
    }

    request.session.destroy();
    response.status(200).end();
});

router.post('/login', async (request, response, next) => {
    
    const id = request.body.id;
    const pw = request.body.pw;
    if(!id || !pw) {
        // return next(new AuthError(401));
        response.writeHead(400);
        response.end();
        return;
    }

    const field = (id.indexOf('@') == -1) ? 'name' : 'email';
    let conn, res1;
    try {
        conn = await dbPool.getConnection();
        res1 = await conn.query(`select * from t_user where ${field} = ?`, [id]);
        if(res1.length !== 1) {
            throw new DBError('Fail : Nonexistent id', 406);
        }

        const res2 = await conn.query(`select SHA2(?, 256) as val`, [pw]);
        const pwHashResult = res2[0];

        // should change to hashing module?
        if(res1[0].passwd !== pwHashResult.val) {
            throw new DBError('Fail : Wrong password', 406);
        }
    
        conn.release();
    } catch (err) {
        if (conn){
            conn.release();
        }

        // conn error (500), res1 error (500), Nonexistent id (406), res2 error (500), Wrong password (406)
        return next(err);
    }

    let sess = request.session;
    sess.uid = res1[0].id;
    sess.name = res1[0].name;
    sess.email = res1[0].email;
    sess.is_admin = res1[0].is_admin;

    console.log(`[${id}] login`);
    response.status(200).end();
});

router.post('/logout', (request, response) => {
    
    const id = request.session.uid;
    if(!id) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    // await util.promisify(request.session.destroy)();
    request.session.destroy((err)=>{
        if(!err) {
            response.status(200).end();
        }
        else {
            response.writeHead(500);
            response.end('Internal Server Error');
            console.log(err);
        }
    });
});

router.get('/editProfile', async (request, response, next) => {
	
    let id = request.session.uid;
    if(!id) {
        return response.redirect('/');
    }

    let conn, res1, data;
    try {
        conn = await dbPool.getConnection();
        res1 = await conn.query(`select * from t_avatar`);
        conn.release();

        const fileName = path.join(__dirname, '../public/editProfile.ejs');
        data = await fsp.readFile(fileName, { encoding: 'utf8' });

    } catch (err) {
        if (conn){
            conn.release();    
        }

        // conn error (500), query error (500), read file error (500)
        return next(err);
    }

    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end(ejs.render(data, {'avatar_infos' : res1}));
});

router.get('/profile', async (request, response, next) => {
    
    const uid = request.session.uid;
    if(!uid) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    let conn, res1;
    try {
        conn = await dbPool.getConnection();
        res1 = await conn.query(`select name, email, avatar_id, vr_hand_sync from t_user where id = ?`, uid);
        if(res1.length !== 1){
            throw new DBError('Removed account', 412);
        }

        conn.release();

    } catch (err) {
        if (conn){
            conn.release();    
        }

        // conn error (500), query error (500), Removed account (412)
        return next(err);
    }

    // Extract some properties from the query result
    const { name, email, avatar_id, vr_hand_sync } = res1[0];
    response.status(200).json({ name, email, avatar_id, vr_hand_sync });
});

router.post('/alterUser', async (request, response, next) => {
    
    const uid = request.session.uid;
    if(!uid) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    let { name, email, pw, new_pw, avatar, vrHandSync } = request.body;
    const avatar_id = parseInt(avatar);
    if(!name || !email || !pw || !vrHandSync || isNaN(avatar_id)) {
        // return next(new AuthError(400));
        response.writeHead(400);
        response.end();
        return;
    }

    vrHandSync == (vrHandSync == 'true') ? 1 : 0;
    let conn;
    try {
        conn = await dbPool.getConnection();

        const res1 = await conn.query(`select SHA2(?, 256) = (select passwd from t_user where id=?) as valid`, [pw, uid]);
        if(res1[0].valid !== 1) {
            throw new DBError('Nonexistent account or wrong password', 403);
        }

        let query, params;
        if(new_pw) {
            query = `update t_user set name=?, email=?, passwd=SHA2(?, 256), avatar_id=?, vr_hand_sync=b'${vrHandSync}' where id=?`;
            params = [name, email, new_pw, avatar_id, uid];
        }
        else {
            query = `update t_user set name=?, email=? where id=?`;
            params = [name, email, uid];
        }
        await conn.query(query, params);

        conn.release();

    } catch (err) {
        if (conn){
            conn.release();    
        }

        // conn error (500), query error 1 (500), Nonexistent account or wrong password (403), Duplicate name or email (500)
        return next(err);
    }

    response.status(200).end();
});

router.get('/invitationList', async (request, response, next) => {
    
    const uid = request.session.uid;    
    if(!uid) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    let conn, res1;
    try {
        conn = await dbPool.getConnection();
        res1 = await conn.query(`select IW.id, U.name as sender_name, IW.message, IW.workspace_id as wid, IW.name as wname, IW.created_date as cdate from (select tmp.id, tmp.sender_id, tmp.message, tmp.workspace_id, tmp.created_date, W.name from (select * from t_invite where receiver_id = ?) as tmp join t_workspace as W on tmp.workspace_id = W.id) as IW join t_user as U on IW.sender_id = U.id`, [uid]);
        conn.release();

    } catch (err) {
        if (conn){
            conn.release();    
        }

        // conn error (500), query error (500)
        return next(err);
    }

    response.status(200).json(res1);
});

router.get('/main', async (request, response, next) => {
    
    const id = request.session.uid;
    if(!id) {
        return response.redirect('/');
    }

    let data;
    try {
        const fileName = path.join(__dirname, '../public/main.html');
        data = await fsp.readFile(fileName, { encoding: 'utf8' });

    } catch(err) {
        // internal server error (500)
        return next(err);
    }

    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end(data);
});

router.get('/workspace', async (request, response, next) => {

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
    let uname, wname, created, rid, canWrite, canInvite, vrOptions, data, workspace;
    try {
        conn = await dbPool.getConnection();
        const res1 = await conn.query(`select u.name, p.rid from (select id, name from t_user where id = ?) as u join t_participation as p on p.uid = u.id where p.wid = ?`, [uid, wid]);
        if(res1.length !== 1){
            throw new DBError('Unauthorized access', 403);
        }

        const res2 = await conn.query(`select id, name, created_date, content, vr_options from t_workspace where id = ?`, wid);
        if(res2.length !== 1) {
            throw new DBError('DB query error', 500);
        }

        const res3 = await conn.query(`select * from t_auth_role_relation where rid = ?`, res1[0].rid);
        if(res3.length === 0) {
            throw new DBError('Unauthorized user role', 403);
        }
        
        const fileName = path.join(__dirname, '../public/workspace.ejs');
        workspace = await fsp.readFile(fileName, { encoding: 'utf8' });

        uname = res1[0].name;
        wname = res2[0].name;
        vrOptions = res2[0].vr_options;
        created = res2[0].created_date;
        rid = res3[0].rid;
        data = '<a-entity><a-camera></a-camera></a-entity>' + res2[0].content;
        canWrite = false;
        canInvite = false;
        for(let r of res3) {
            if(r.aid === 5)
                canWrite = true;
            else if(r.aid === 2)
                canInvite = true;
        }

        // Update last access time 
        await conn.query("update t_participation set access_date = NOW() where uid = ? and wid = ?", [uid, wid]);

        conn.release();

    } catch (err) {
        if (conn){
            conn.release();    
        }
        
        // conn error (500), res1 error (500), Unauthorized access (403), res2 error (500), res2 query error (500)
        // res3 error (500), Unauthorized user role (403), file read error (500), part update error (500)
        return next(err);
    }

    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end(ejs.render(workspace, {uname, wid, wname, created, rid, canWrite, canInvite, vrOptions, data }));
});

router.get('/manageAssets', async (request, response) => {

    const uid = request.session.uid;
    if(!uid) {
        // return next(new AuthError(401));
        response.writeHead(401);
        response.end();
        return;
    }

    let data;
    try {
        const fileName = path.join(__dirname, '../public/manageAssets.html');
        data = await fsp.readFile(fileName, { encoding: 'utf8' });

    } catch (err) {
        // internal server error (500)
        return next(err);
    }

    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end(data);
});

module.exports = router;