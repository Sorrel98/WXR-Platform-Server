var express = require('express');
var fs = require('fs');
var session = require('express-session');
var ejs = require('ejs');

// get DBpool module
var dbPool = require('./DBpool').dbPool;


var server = require('./server');
var express = server.express;
var app = server.app;

//router module
var workspace = require('./routes/workspace');
var asset = require('./routes/asset');
const { SqlError } = require('mariadb/callback');

// error class
class DB_Error extends Error {
    constructor(message, statusCode){
        super(message);
        this.statusCode = statusCode;
    }
}

// parse application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
// parse application/json
app.use(express.json());
app.session = session({
    secret: '@dFaL^ASdD!*',
    resave: false,
    saveUninitialized: true
});
app.use(app.session);
app.use(express.static(__dirname + '/../public'));

//route
app.use('/', workspace);
app.use('/', asset);

app.get('/', function(request, response) {
    let sess = request.session;
    if(sess.uid) {
        response.redirect('/main');
    }
    else {
        response.redirect('/loginPage');
    }
});

app.get('/loginPage', function(request, response) {
    fs.readFile(__dirname + '/../public/loginPage.html', 'utf8', (error, data)=> {
        if(!error) {
            response.writeHead(200, {'Content-Type': 'text/html'});
            response.end(data);
        }
        else {
            response.writeHead(500);
            response.end('Internal Server Error');
            console.log(error);
        }
    });
});

app.post('/register', async function(request, response, next) {
    let name = request.body.name;
    let email = request.body.email;
    let pw = request.body.pw1; 
    if(!name || !email || !pw) {
        response.writeHead(400);
        response.end();
        return;
    }
    
    try{
        var conn = await dbPool.getConnection();
        await conn.beginTransaction();
        var res1 = await conn.query("insert into t_user(name, email, passwd, is_admin) values (?, ?, SHA2(?, 256), b'0')", [name, email, pw])
        var res2 = await conn.query("insert into t_asset_item(name, owner_id, item_type) values (?, ?, b'0')", [name, res1.insertId]);
        request.session.uid = res1.insertId;
        request.session.name = name;
        request.session.email = email;
        request.session.is_admin = Buffer.alloc(1, 0x00);
        response.writeHead(200);
        response.end();
        conn.commit();
        conn.release();
    } catch(error) {
        if (conn){
            conn.rollback();
            conn.release();    
        }
        next(error);
    }
});

app.post('/removeAccount', async function(request, response, next) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }

    try {
        var conn = await dbPool.getConnection();
        await conn.query("delete from t_user where id = ?", [uid]);
        request.session.destroy();
        response.writeHead(200);
        response.end();
        conn.release();
    } catch (error) {
        if (conn){
            conn.release();    
        }
        next(error);
    }
});

app.post('/login', async function(request, response, next) {
    let id = request.body.id;
    let pw = request.body.pw;
    if(!id || !pw) {
        response.writeHead(400);
        response.end();
        return;
    }
    var field;
    if(id.indexOf('@') == -1) {
        field = 'name';
    }
    else {
        field = 'email';
    }

    try {
        var conn = await dbPool.getConnection();
        var res1 = await conn.query("select * from t_user where " + field + " = ?", [id]);
        if(res1.length !== 1) {
            throw new DB_Error('Fail : Nonexistent id', 406);
            // response.writeHead(406);
            // response.end('Fail : Nonexistent id');
        }

        var res2 = await conn.query("select SHA2(?, 256) as val", [pw])
        let pwHashResult = res2[0];

        if(res1[0].passwd !== pwHashResult.val) {
            throw new DB_Error('Fail : Wrong password', 406);
            // response.writeHead(406);
            // response.end('Fail : Wrong password');
        }

        let sess = request.session;
        sess.uid = res1[0].id;
        sess.name = res1[0].name;
        sess.email = res1[0].email;
        sess.is_admin = res1[0].is_admin;
        response.writeHead(200);
        response.end();
        console.log('[' + id + '] login');
    
        conn.release();
    } catch (error) {
        if (conn){
            conn.release();    
        }
        next(error);
    }
});

app.post('/logout', function(request, response) {
    let id = request.session.uid;
    if(!id) {
        response.writeHead(401);
        response.end();
        return;
    }
    request.session.destroy((err)=>{
        if(!err) {
            response.writeHead(200);
            response.end();
        }
        else {
            response.writeHead(500);
            response.end('Internal Server Error');
            console.log(err);
        }
    });
});

app.get('/editProfile', async function(request, response, next) {
	let id = request.session.uid;
    if(!id) {
        response.redirect('/');
        return;
    }

    try {
        var conn = await dbPool.getConnection();
        var res1 = await conn.query("select * from t_avatar");
        fs.readFile(__dirname + '/../public/editProfile.ejs', 'utf8', (fsErr, data) => {
            if(!fsErr) {
                response.writeHead(200, {'Content-Type': 'text/html'});
                response.end(ejs.render(data, {'avatar_infos' : res1}));
            }
            else {
                response.writeHead(500);
                response.end('Internal Server Error');
                console.log(fsErr);
            }
        });
        conn.release();
    } catch (error) {
        if (conn){
            conn.release();    
        }
        next(error);
    }
});

app.get('/profile', async function(request, response, next) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }

    try {
        var conn = await dbPool.getConnection();
        var res1 = await conn.query("select name, email, avatar_id, vr_hand_sync from t_user where id = ?", uid);
        if(res1.length === 1) {
            response.status(200).json({'name': res1[0].name, 'email': res1[0].email, 'avatar_id': res1[0].avatar_id, 'vr_hand_sync': res1[0].vr_hand_sync});
        }
        else {
            response.writeHead(412);
            response.end('Removed account');
        }
        conn.release();
    } catch (error) {
        if (conn){
            conn.release();    
        }
        next(error);
    }
});

app.post('/alterUser', async function(request, response, next) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let name = request.body.name;
    let email = request.body.email;
    let pw = request.body.pw;
    let new_pw = request.body.pw1;
	let avatar_id = parseInt(request.body.avatar);
    let vrHandSync = request.body.vrHandSync;

    if(!name || !email || !pw || !vrHandSync || isNaN(avatar_id)) {
        response.writeHead(400);
        response.end();
        return;
    }

    if(vrHandSync == "true") vrHandSync = '1';
    else vrHandSync = '0';

    try {
        var conn = await dbPool.getConnection()
        var res1 = await conn.query("select SHA2(?, 256) = (select passwd from t_user where id=?) as valid", [pw, uid])
        if(res1[0].valid === 1) {
            if(new_pw) {
                await conn.query("update t_user set name=?, email=?, passwd=SHA2(?, 256), avatar_id=?, vr_hand_sync=b'" + vrHandSync + "' where id=?", [name, email, new_pw, avatar_id, uid])
                response.writeHead(200);
                response.end();
            }
            else {
                await conn.query("update t_user set name=?, email=? where id=?", [name, email, uid])
                response.writeHead(200);
                response.end();
            }
        }
        else {
            response.writeHead(403);
            response.end('Nonexistent account or wrong password');
        }
        conn.release();
    } catch (error) {
        if (conn){
            conn.release();    
        }
        next(error);
    }
});

app.get('/invitationList', async function(request, response, next) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }

    try {
        conn = await dbPool.getConnection();
        var res1 = await conn.query("select IW.id, U.name as sender_name, IW.message, IW.workspace_id as wid, IW.name as wname, IW.created_date as cdate from (select tmp.id, tmp.sender_id, tmp.message, tmp.workspace_id, tmp.created_date, W.name from (select * from t_invite where receiver_id = ?) as tmp join t_workspace as W on tmp.workspace_id = W.id) as IW join t_user as U on IW.sender_id = U.id", [uid])
        response.status(200).json(res1);
        conn.release();
    } catch (error) {
        if (conn){
            conn.release();    
        }
        next(error);
    }
});

app.get('/main', function(request, response) {
    let id = request.session.uid;
    if(!id) {
        response.redirect('/');
        return;
    }
    fs.readFile(__dirname + '/../public/main.html', 'utf8', (fsErr, data) => {
        if(!fsErr) {
            response.writeHead(200, {'Content-Type': 'text/html'});
            response.end(data);
        }
        else {
            response.writeHead(500);
            response.end('Internal Server Error');
            console.log(fsErr);
        }
    });
});


app.get('/workspace', async function(request, response, next) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let wid = request.query.id;
    if(!wid) {
        response.writeHead(400);
        response.end();
        return;
    }

    try {
        var conn = await dbPool.getConnection();
        var res1 = await conn.query("select u.name, p.rid from (select id, name from t_user where id = ?) as u join t_participation as p on p.uid = u.id where p.wid = ?", [uid, wid])
        if(res1.length === 1) {
            var res2 = await conn.query("select id, name, created_date, content, vr_options from t_workspace where id = ?", wid)
            if(res2.length === 1) {
                var res3 = await conn.query("select * from t_auth_role_relation where rid = ?", res1[0].rid)
                if(res3.length !== 0) {
                    let content = '<a-entity><a-camera></a-camera></a-entity>' + res2[0].content;
                    let wname = res2[0].name;
                    let wcdate = res2[0].created_date;
                    let rid = res3[0].rid;
                    let canWrite = false;
                    let canInvite = false;
                    for(let r of res3) {
                        if(r.aid === 5)
                            canWrite = true;
                        else if(r.aid === 2)
                            canInvite = true;
                    }
                    fs.readFile(__dirname + '/../public/workspace.ejs', 'utf8', async (fsErr, workspace)=>{
                        if(!fsErr) {
                            response.writeHead(200, {'Content-Type': 'text/html'});
                            response.end(ejs.render(workspace, {uname: res1[0].name, wid: wid, wname: wname, created: wcdate, rid: rid, canWrite: canWrite, canInvite: canInvite, vrOptions: res2[0].vr_options, data: content}));
                            await conn.query("update t_participation set access_date = NOW() where uid = ? and wid = ?", [uid, wid]);
                        }
                        else {
                            response.writeHead(500);
                            response.end('Internal Server Error');
                            console.log(fsErr);
                        }
                    });
                }
                else {
                    response.writeHead(403);
                    response.end();
                }
            } else {
                response.writeHead(500);
                response.end('DB query error');
            }
        }
        else {
            response.writeHead(403);
            response.end();
        }
        conn.release();
    } catch (error) {
        if (conn){
            conn.release();    
        }
        next(error);
    }
});

app.get('/manageAssets', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    fs.readFile(__dirname + '/../public/manageAssets.html', 'utf8', (error, data)=> {
        if(!error) {
            response.writeHead(200, {'Content-Type': 'text/html'});
            response.end(data);
        }
        else {
            response.writeHead(500);
            response.end('Internal Server Error');
            console.log(error);
        }
    });
});

// Error Handle
app.use(function dbErrorHandler(error, request, response, next){
    if(!(error instanceof DB_Error)){
        next(error);
    }
    response.writeHead(error.statusCode);
    response.end(error.message);    
})

app.use(function dbPoolAPIErrorHandler(error, request, response, next) {
    if(!(error instanceof SqlError)){
        next(error)
    }
    let errno = error.errno;
    
    response.writeHead(500);

    // Fail to connect DB
    if (errno === 1152 || errno === 45028) {
        response.end(`Fail to connect DB (errno : ${errno})`);
    } 
    // DB Transaction error    
    else if (errno === 1205) {
        response.end(`DB Transaction error  (errno : ${errno})`);
    }
    // Duplicate name or email
    else if (errno === 1062) {
        response.end(`Duplicate name or email (errno : ${errno})`);
    }
    // // DB query error
    // else if (errno === ) {
    //     response.end(`DB query error (errno : ${error.errno})`);
    // } 
    // other error
    else {
        response.end(`Maybe DB error or not (errno : ${errno})`);
    }

    console.log(error);
})