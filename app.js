var http = require('http');
var https = require('https');
var express = require('express');
var multiparty = require('multiparty');
var bodyParser = require('body-parser');
var fs = require('fs');
var mariadb = require('mariadb/callback');
var session = require('express-session');
var sharedSession = require('express-socket.io-session');
var ejs = require('ejs');
var uuidv4 = require('uuid').v4;

//router module
var workspace = require('./routes/workspace');
var asset = require('./routes/asset');

//server certification
var httpOptions = {
	key: fs.readFileSync("certificate/private.key"),
    cert: fs.readFileSync("certificate/certificate.crt"),
	ca : fs.readFileSync("rootCA/certificate.crt"),
	agent: false
}
var dbConfig = {
    host : 'localhost',
    user : 'wxrDBadmin',
    password: 'dbpasswd',
    database: 'wxr_server'
};
var dbPool = mariadb.createPool(dbConfig);
var app = express();

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
app.use(express.static(__dirname + '/public'));

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
    fs.readFile(__dirname + '/public/loginPage.html', 'utf8', (error, data)=> {
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

app.post('/register', function(request, response) {
    let name = request.body.name;
    let email = request.body.email;
    let pw = request.body.pw1; 
    if(!name || !email || !pw) {
        response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=>{
        if(!error) {
            conn.beginTransaction((trErr)=>{
                if(!trErr) {
                    conn.query("insert into t_user(name, email, passwd, is_admin) values (?, ?, SHA2(?, 256), b'0')", [name, email, pw], (err1, result1)=> {
                        if(!err1) {
                            conn.query("insert into t_asset_item(name, owner_id, item_type) values (?, ?, b'0')", [name, result1.insertId], (err2, result2)=>{
                                if(!err2) {
                                    request.session.uid = result1.insertId;
                                    request.session.name = name;
                                    request.session.email = email;
                                    request.session.is_admin = Buffer.alloc(1, 0x00);
                                    response.writeHead(200);
                                    response.end();
                                    conn.commit();
                                }
                                else {
                                    response.writeHead(500);
                                    response.end('DB query error');
                                    console.log(err2);
                                    conn.rollback();
                                }
                                conn.release();
                            });
                        }
                        else {
                            response.writeHead(500);
                            response.end('Duplicate name or email');
                            console.log(err1);
                        }
                    });
                }
                else {
                    response.writeHead(500);
                    response.end('DB Transaction error');
                    console.log(trErr);
                    conn.release();
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.post('/removeAccount', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("delete from t_user where id = ?", [uid], (err, result)=> {
                if(!err) {
                    request.session.destroy();
                    response.writeHead(200);
                    response.end();
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err);
                }
                conn.release();
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.post('/login', function(request, response) {
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
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select * from t_user where " + field + " = ?", [id], (err1, result1)=> {
                if(!err1) {
                    if(result1.length === 1) {
                        conn.query("select SHA2(?, 256) as val", [pw], (err2, result2)=> {
                            if(!err2) {
                                let pwHashResult = result2[0];
                                if(result1[0].passwd === pwHashResult.val) {
                                    let sess = request.session;
                                    sess.uid = result1[0].id;
                                    sess.name = result1[0].name;
                                    sess.email = result1[0].email;
                                    sess.is_admin = result1[0].is_admin;
                                    response.writeHead(200);
                                    response.end();
                                    console.log('[' + id + '] login');
                                }
                                else {
                                    response.writeHead(406);
                                    response.end('Fail : Wrong password');
                                }
                            }
                            else {
                                response.writeHead(500);
                                response.end('DB query error');
                                console.log(err2);
                            }
                            conn.release();
                        });                
                    }
                    else {
                        conn.release();
                        response.writeHead(406);
                        response.end('Fail : Nonexistent id');
                    }
                }
                else {
                    conn.release();
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
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

app.get('/makePage', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    fs.readFile(__dirname + '/public/makePage.html', 'utf8', (fsErr, data) => {
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

app.post('/make', function(request, response) { // todo: Check the content source validation
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let name = request.body.workspaceName;
    if(!name) {
        response.writeHead(400);
        response.end();
        return;
    }
    let tags = request.body.tags;
    let tagArr = tags.split(',');
    for(let i = 0; i < tagArr.length; ++i)
        tagArr[i] = tagArr[i].trim();
	if(tagArr.length === 1 && tagArr[0] === '')
		tagArr = [];
	let source = request.body.source || '';
	source = source.replace(/'/g, '"');
    dbPool.getConnection((error, conn)=> {
        if(!error) {
			conn.beginTransaction((trErr)=>{
				if(!trErr) {
					conn.query("insert into t_workspace(name, created_date, owner, content) values(?, NOW(), ?, ?)", [name, uid, source], (err1, result1)=>{
						if(!err1) {
							conn.query("insert into t_participation(uid, wid, rid, bookmark, access_date) values(?, ?, 1, b'0', NULL)", [uid, result1.insertId], (err2, result2)=>{
								if(!err2) {
                                    let promArr = [];
                                    for(let tag of tagArr) {
                                        new Promise((resolve, reject)=> {
                                            conn.query("insert into t_tag(wid, name) values(" + result1.insertId + ", ?)", tag, (err3, result3)=>{
                                                if(!err3)
                                                    resolve();
                                                else
                                                    reject(err3);
                                            });
                                        }); 
                                    }
                                    Promise.allSettled(promArr).then((results)=>{
										let errAny = false;
                                        results.forEach((result)=>{
                                            if(result.status !== 'fulfilled')
                                                errAny = true;
                                        });
                                        if(!errAny) {
                                            conn.commit();
                                            response.writeHead(200);
                                            response.end();
                                        }
                                        else {
                                            conn.rollback();
                                            response.writeHead(500);
                                            response.end('DB Transaction error');
                                            console.log(err3);
                                        }
                                        conn.release();
                                    });
								}
								else {
									conn.rollback();
									conn.release();
									response.writeHead(500);
									response.end('DB Transaction error');
                                    console.log(err2);
								}
							});
						}
						else {
							conn.release();
							response.writeHead(500);
							response.end('DB Transaction error');
                            console.log(err1);
						}
					});
				}
				else {
					conn.release();
					response.writeHead(500);
					response.end('DB Transaction error');
                    console.log(trErr);
				}
			});
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.post('/removeWorkspace', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let wid = request.body.wid;
    if(!wid) {
        response.writeHead(400);
        response.end();
        return;
    }
	if(sessionManager.isLiveSession(parseInt(wid))) {
		response.writeHead(400);
		response.end('There is a running session');
		return;
	}
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select owner from t_workspace where id = ?", wid, (err1, result1)=> {
                if(!err1) {
                    if(result1.length === 1 && result1[0].owner === uid) {
                        conn.query("delete from t_workspace where id = ?", wid, (err2, result2)=> {
                            if(!err2) {
                                response.writeHead(200);
                                response.end();
                            }
                            else {
                                response.writeHead(500);
                                response.end('DB query error');
                                console.log(err2);
                                
                            }
                            conn.release();
                        });
                    }
                    else {
                        conn.release();
                        response.writeHead(403);
                        response.end('The owner can remove only');
                    }
                }
                else {
                    conn.release();
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.get('/editProfile', function(request, response) {
	let id = request.session.uid;
    if(!id) {
        response.redirect('/');
        return;
    }
	dbPool.getConnection((error, conn)=>{
		if(!error) {
			conn.query("select * from t_avatar", (err1, result1)=>{
				if(!err1) {
					fs.readFile(__dirname + '/public/editProfile.ejs', 'utf8', (fsErr, data) => {
						if(!fsErr) {
							response.writeHead(200, {'Content-Type': 'text/html'});
							response.end(ejs.render(data, {'avatar_infos' : result1}));
						}
						else {
							response.writeHead(500);
							response.end('Internal Server Error');
							console.log(fsErr);
						}
					});
				}
				else {
					response.writeHead(500);
                    response.end('DB query error');
				}
				conn.release();
			});
		}
		else {
			response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
		}
	});
});

app.get('/profile', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select name, email, avatar_id, vr_hand_sync from t_user where id = ?", uid, (err1, result1)=>{
                if(!err1) {
                    if(result1.length === 1) {
						response.status(200).json({'name': result1[0].name, 'email': result1[0].email, 'avatar_id': result1[0].avatar_id, 'vr_hand_sync': result1[0].vr_hand_sync});
                    }
                    else {
                        response.writeHead(412);
                        response.end('Removed account');
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                }
				conn.release();
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.post('/alterUser', function(request, response) {
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

    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select SHA2(?, 256) = (select passwd from t_user where id=?) as valid", [pw, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1[0].valid === 1) {
                        if(new_pw) {
                            conn.query("update t_user set name=?, email=?, passwd=SHA2(?, 256), avatar_id=?, vr_hand_sync=b'" + vrHandSync + "' where id=?", [name, email, new_pw, avatar_id, uid], (err2, result2)=>{
                                if(!err2) {
                                    response.writeHead(200);
                                    response.end();
                                }
                                else {
                                    response.writeHead(500);
                                    response.end('Duplicate name or email');
                                    console.log(err2);
                                }
                                conn.release();
                            });
                        }
                        else {
                            conn.query("update t_user set name=?, email=? where id=?", [name, email, uid], (err2, result2)=>{
                                if(!err2) {
                                    response.writeHead(200);
                                    response.end();
                                }
                                else {
                                    response.writeHead(500);
                                    response.end('Duplicate name or email');
                                    console.log(err2);
                                }
                                conn.release();
                            });
                        }
                    }
                    else {
                        conn.release();
                        response.writeHead(403);
                        response.end('Nonexistent account or wrong password');
                    }
                }
                else {
                    conn.release();
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.post('/setBookmark', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let wid = parseInt(request.body.wid);
    let val = parseInt(request.body.val);
    if(isNaN(wid) || isNaN(val) || val > 1 || val < 0) {
        response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=>{
        if(!error) {
            conn.query("update t_participation set bookmark=? where uid=? and wid=?", [val, uid, wid], (err1, result1)=>{
                if(!err1) {
                    if(result1.affectedRows !== 0) {
                        response.writeHead(200);
                        response.end();
                    }
                    else {
                        response.writeHead(412);
                        response.end('You are not participant');
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                }
                conn.release();
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.get('/wsList', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let page = parseInt(request.query.page);
    let rows = parseInt(request.query.rows);
    let order = parseInt(request.query.order);
    let desc = request.query.desc;
    let bookmarkOnly = request.query.bmonly;
    if(desc === 'false') desc = false;
    else if(desc === 'true') desc = true;
    else desc = undefined;
    if(bookmarkOnly === 'false') bookmarkOnly = false;
    else if(bookmarkOnly === 'true') bookmarkOnly = true;
    else bookmarkOnly = undefined;
    let keyword = request.query.keyword;
    if(isNaN(page) || isNaN(rows) || isNaN(order) || order > 3 || desc === undefined || bookmarkOnly === undefined) {
        response.writeHead(400);
        response.end();
        return;
    }
    const orderCols = ['name', 'size', 'access_date', 'owner_name'];
    let total = -1;
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            if(keyword) {
                conn.query("select SQL_CALC_FOUND_ROWS W.id, W.name, W.created_date, W.owner_name, (select count(*) from t_participation where wid = W.id) as size, PR.access_date, PR.role_name, PR.bookmark from ( select TMP.wid, TMP.bookmark, TMP.access_date, R.name as role_name from ( select * from t_participation where uid = ?" + (bookmarkOnly?" and bookmark=1":"") + ") as TMP join t_role as R on TMP.rid = R.id ) as PR join ( select U.name as owner_name, WS.id, WS.name, WS.description, WS.thumbnail, WS.created_date from t_workspace as WS join t_user as U on WS.owner = U.id ) as W on PR.wid = W.id where W.name like ? or W.id in (select distinct wid from t_tag where name = ?) order by " + orderCols[order] + (desc ? " desc " : " ") + "limit " + String((page - 1) * rows) + ", " + String(rows), [uid, "%" + keyword + "%", keyword], (err1, result1)=>{
                    if(!err1) {
                        conn.query("select FOUND_ROWS() as total", (err2, result2)=>{
                            if(!err2) {
                                total = result2[0].total;
                                let promArr = [];
                                for(let tuple of result1) {
                                    tuple.tags = [];
                                    promArr.push(new Promise((resolve, reject)=>{
                                        conn.query("select name from t_tag where wid = ?", tuple.id, (err3, result3)=>{
                                            if(!err3) {
                                                for(let t of result3) {
                                                    tuple.tags.push(t.name);
                                                }
                                                resolve();
                                            }
                                            else {
                                                reject(err3);
                                            }
                                        });
                                    }));
                                }
                                Promise.allSettled(promArr).then((results)=>{
                                    conn.release();
                                    let errAny = false;
                                    results.forEach((result)=>{
                                        if(result.status !== 'fulfilled')
                                            errAny = true;
                                    });
                                    if(!errAny) {
                                        response.status(200).json({'total': total, 'result': result1});
                                    }
                                    else {
                                        response.writeHead(500);
                                        response.end('DB query error');
                                    }
                                });
                            }
                            else {
                                conn.release();
                                response.writeHead(500);
                                response.end('DB query error');
                            }
                        });
                    }
                    else {
                        conn.release();
                        response.writeHead(500);
                        response.end();
                    }
                });
            }
            else {
                conn.query("select SQL_CALC_FOUND_ROWS W.id, W.name, W.created_date, W.owner_name, (select count(*) from t_participation where wid = W.id) as size, PR.access_date, PR.role_name, PR.bookmark from ( select TMP.wid, TMP.bookmark, TMP.access_date, R.name as role_name from ( select * from t_participation where uid = ?" + (bookmarkOnly?" and bookmark=1":"") + ") as TMP join t_role as R on TMP.rid = R.id ) as PR join ( select U.name as owner_name, WS.id, WS.name, WS.description, WS.thumbnail, WS.created_date from t_workspace as WS join t_user as U on WS.owner = U.id ) as W on PR.wid = W.id order by " + orderCols[order] + (desc ? " desc " : " ") + "limit " + String((page - 1) * rows) + ", " + String(rows), [uid], (err1, result1)=>{
                    if(!err1) {
                        conn.query("select FOUND_ROWS() as total", (err2, result2)=>{
                            if(!err2) {
                                total = result2[0].total;
                                let promArr = [];
                                for(let tuple of result1) {
                                    promArr.push(new Promise((resolve, reject)=>{
                                        conn.query("select name from t_tag where wid = ?", tuple.id, (err3, result3)=>{
                                            if(!err3) {
                                                tuple.tags = [];
                                                for(let t of result3) {
                                                    tuple.tags.push(t.name);
                                                }
                                                resolve();
                                            }
                                            else {
                                                reject(err3);
                                            }
                                        });
                                    }));
                                }
                                Promise.allSettled(promArr).then((results)=>{
                                    conn.release();
                                    let errAny = false;
                                    results.forEach((result)=>{
                                        if(result.status !== 'fulfilled')
                                            errAny = true;
                                    });
                                    if(!errAny) {
                                        response.status(200).json({'total': total, 'result': result1});
                                    }
                                    else {
                                        response.writeHead(500);
                                        response.end('DB query error');
                                    }
                                });                                
                            }
                            else {
                                conn.release();
                                response.writeHead(500);
                                response.end('DB query error');
                            }
                        });
                    }
                    else {
                        conn.release();
                        response.writeHead(500);
                        response.end();
                    }
                });
            }
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.get('/invitationList', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=>{
        if(!error) {
            conn.query("select IW.id, U.name as sender_name, IW.message, IW.workspace_id as wid, IW.name as wname, IW.created_date as cdate from (select tmp.id, tmp.sender_id, tmp.message, tmp.workspace_id, tmp.created_date, W.name from (select * from t_invite where receiver_id = ?) as tmp join t_workspace as W on tmp.workspace_id = W.id) as IW join t_user as U on IW.sender_id = U.id", [uid], (err1, result1)=>{
                if(!err1) {
                    response.status(200).json(result1);
                }
                else {
                }
                conn.release();
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.get('/main', function(request, response) {
    let id = request.session.uid;
    if(!id) {
        response.redirect('/');
        return;
    }
    fs.readFile(__dirname + '/public/main.html', 'utf8', (fsErr, data) => {
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

app.post('/invite', function(request, response) {
    let senderId = request.session.uid;
    if(!senderId) {
        response.writeHead(401);
        response.end();
        return;
    }
    let receiver = request.body.receiver;
    let message = request.body.message;
    let workspaceId = request.body.workspaceId;
    if(!receiver || !workspaceId) {
        response.writeHead(400);
        response.end();
        return;
    }
    let field = 'email';
    if(receiver.indexOf('@') === -1)
        field = 'name';
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select count(*) as cnt from t_auth_role_relation where aid = 2 and rid = (select rid from t_participation where uid = ? and wid = ?)", [senderId, workspaceId], (err1, result1)=> {
                if(!err1) {
                    if(result1[0].cnt === 1) {
                        conn.query("select id from t_user where " + field + " = ?", [receiver], (err2, result2)=>{
                            if(!err2) {
                                if(result2.length === 1) {
                                    let receiverId = result2[0].id;
                                    conn.query("select count(*) as cnt from t_participation where uid = ? and wid = ?", [receiverId, workspaceId], (err3, result3)=> {
                                        if(!err3) {
                                            if(result3[0].cnt === 0) {
                                                conn.query("insert into t_invite(sender_id, receiver_id, message, workspace_id, created_date) values(?, ?, ?, ?, NOW())", [senderId, receiverId, message, workspaceId], (err4, result4)=>{
                                                    if(!err4) {
                                                        response.writeHead(200);
                                                        response.end();
                                                    }
                                                    else {
                                                        response.writeHead(500);
                                                        response.end('DB query error');
                                                        console.log(err4);
                                                    }
                                                    conn.release();
                                                });
                                            }
                                            else {
                                                conn.release();
                                                response.writeHead(412);
                                                response.end('The receiver already participating');
                                            }
                                        }
                                        else {
                                           conn.release();
                                            response.writeHead(500);
                                            response.end('DB query error');
                                            console.log(err3);
                                        }
                                    });
                                }
                                else {
                                    conn.release();
                                    response.writeHead(412);
                                    response.end('The receiver does not exist');
                                }
                            }
                            else {
                                conn.release();
                                response.writeHead(500);
                                response.end('DB query error');
                                console.log(err2);
                            }
                        });
                    }
                    else {
                        conn.release();
                        response.writeHead(403);
                        response.end();
                    }
                }
                else {
                    conn.release();
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                }
            });            
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });    
});

app.post('/join', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let iid = request.body.inviteId;
    if(!iid) {
        response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select * from t_invite where id = ? and receiver_id = ?", [iid, uid], (err1, result1)=> {
                if(!err1) {
                    if(result1.length === 1) {
                        let wid = result1[0].workspace_id;
                        conn.beginTransaction((trErr)=>{
                            if(!trErr) {
                                conn.query("insert into t_participation(uid, wid, rid, bookmark) values(?, ?, 5, b'0')", [uid, wid, iid], (err2, result2)=> {
                                    if(!err2) {
                                        conn.query("delete from t_invite where receiver_id = ? and workspace_id = ?", [uid, wid], (err3, result3)=>{
                                            if(!err3) {
                                                conn.commit();
                                                response.writeHead(200);
                                                response.end();
                                            }
                                            else {
                                                conn.rollback();
                                                response.writeHead(500);
                                                response.end('DB Transaction error');
                                                console.log(err3);
                                            }
                                            conn.release();
                                        });
                                    }
                                    else {
                                        conn.release();
                                        response.writeHead(500);
                                        response.end('DB Transaction error');
                                        console.log(err2);
                                    }
                                });
                            }
                            else {
                                conn.release();
                                response.writeHead(500);
                                response.end('DB Transaction error');
                                console.log(trErr);
                            }
                        });
                    }
                    else {
                        conn.release();
                        response.writeHead(412);
                        response.end('You haven\'t been invited');
                    }
                }
                else {
                    conn.release();
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });    
});

app.post('/removeInvite', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let iid = request.body.inviteId;
    if(!iid) {
        response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select * from t_invite where id = ? and receiver_id = ?", [iid, uid], (err1, result1)=> {
                if(!err1) {
                    if(result1.length === 1) {
                        conn.query("delete from t_invite where id = ?", [iid], (err2, result2)=> {
                            if(!err2) {
                                response.writeHead(200);
                                response.end();
                            }
                            else {
                                response.writeHead(500);
                                response.end('DB query error');
                                console.log(err2);
                            }
                            conn.release();
                        });
                    }
                    else {
                        conn.release();
                        response.writeHead(412);
                        response.end('You have\'t been invited');
                    }
                }
                else {
                    conn.release();
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.get('/manage', function(request, response) {
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
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select aid from t_auth_role_relation where rid = (select rid from t_participation where uid = ? and wid = ?)", [uid, wid], (err1, result1)=> {
                if(!err1) {
                    if(result1.length !== 0) {
                        let hasAuth = false;
                        let authArr = [];
                        for(let auth of result1) {
                            authArr.push(auth.aid);
                            if(!hasAuth && (auth.aid === 1 || auth.aid === 3 || auth.aid === 4))
                                hasAuth = true;
                        }
                        if(hasAuth) {
                            conn.query("select * from t_workspace where id = ?", [wid], (err2, result2)=> {
                                if(!err2) {
                                    if(result2.length !== 0) {
										result2[0].content = result2[0].content.replace(/"/g, "'");
                                        conn.query("select name from t_tag where wid = ?", [wid], (err3, result3)=> {
											if(!err3) {
												let tags = "";
												for(let tag of result3) {
													tags += tag.name + ", ";
												}
												tags = tags.substr(0, tags.lastIndexOf(", "));
												conn.query("select U.id, U.name, U.email, P.rid from (select * from t_participation where wid = ?)  as P join t_user as U on P.uid = U.id", [wid], (err4, result4)=> {
													if(!err4) {
														conn.query("select * from t_role", (err5, result5)=> {
															if(!err5) {
																fs.readFile(__dirname + '/public/manage.ejs', 'utf8', (fsErr, manage)=>{
																	if(!fsErr) {
																		response.writeHead(200, {'Content-Type': 'text/html'});
																		response.end(ejs.render(manage, {authority: authArr, spaceInform: result2[0], tags: tags, participant: result4, roleInform: result5}));
																	}
																	else {
																		response.writeHead(500);
																		response.end('Internal Server Error');
																		console.log(fsErr);
																	}
																	conn.release();
																});
															}
															else {
																conn.release();
																response.writeHead(500);
																response.end('DB query error');
																console.log(err5);
															}
														});
													}
													else {
														conn.release();
														response.writeHead(500);
														response.end('DB query error');
														console.log(err4);
													}
												});
											}
											else {
												conn.release();
												response.writeHead(500);
												response.end('DB query error');
												console.log(err3);
											}
										});
                                    }
                                    else {
                                        conn.release();
                                        response.writeHead(412);
                                        response.end('Nonexistent workspace');
                                    }
                                }
                                else {
                                    conn.release();
                                    response.writeHead(500);
                                    response.end('DB query error');
                                    console.log(err2);
                                }
                            });
                        }
                        else {
                            conn.release();
                            response.writeHead(403);
                            response.end();
                        }
                    }
                    else {
                        conn.release();
                        response.writeHead(403);
                        response.end();
                    }
                }
                else {
                    conn.release();
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.post('/alter', function(request, response){ //todo: Check the content source validation
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let wid = request.body.wid;
    let wname = request.body.wname;
    if(!wid || !wname) {
        response.writeHead(400);
        response.end();
        return;
    }
	if(sessionManager.isLiveSession(parseInt(wid))) {
		response.writeHead(400);
		response.end('There is a running session');
		return;
	}
    let tags = request.body.tags || '';
    let tagArr = tags.split(',');
    for(let i = 0; i < tagArr.length; ++i)
        tagArr[i] = tagArr[i].trim();
	if(tagArr.length === 1 && tagArr[0] === '')
		tagArr = [];
    let desc = request.body.description || '';
	let source = request.body.source || '';
	source = source.replace(/'/g, '"');
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select aid from t_auth_role_relation where rid = (select rid from t_participation where uid = ? and wid = ?)", [uid, wid], (err1, result1)=> {
                if(!err1) {
                    let hasAlterAuth = false;
                    for(let auth of result1) {
                        if(auth.aid === 1) {
                            hasAlterAuth = true;
                            break;
                        }
                    }
                    if(hasAlterAuth) {
                        conn.beginTransaction((trErr)=>{
                            if(!trErr) {
                                conn.query("update t_workspace set name=?, description=?, content=? where id=?", [wname, desc, source, wid], (err2, result2)=>{
                                    if(!err2) {
                                        conn.query("delete from t_tag where wid = ?", [wid], (err3, result3)=>{
                                            if(!err3) {
                                                let promArr = [];
                                                for(let tag of tagArr) {
                                                    promArr.push(new Promise((resolve, reject)=> {
                                                        conn.query("insert into t_tag(wid, name) values(?, ?)", [wid, tag], (err4, result4)=>{
                                                            if(!err4)
                                                                resolve();
                                                            else
                                                                reject(err4);
                                                        });
                                                    })); 
                                                }
                                                Promise.allSettled(promArr).then((results)=>{
                                                    let errAny = false;
                                                    results.forEach((result)=>{
                                                        if(result.status !== 'fulfilled')
                                                            errAny = true;
                                                    });
                                                    if(!errAny) {
                                                        conn.commit();
                                                        response.writeHead(200);
                                                        response.end();
                                                    }
                                                    else {
                                                        conn.rollback();
                                                        response.writeHead(500);
                                                        response.end('DB Transaction error');
                                                        console.log(err4);
                                                    }
                                                    conn.release();
                                                });
                                            }
                                            else {
                                                conn.release();
                                                response.writeHead(500);
                                                response.end('DB Transaction error');
                                                console.log(err3);
                                            }
                                        });
                                    }
                                    else {
                                        conn.release();
                                        response.writeHead(500);
                                        response.end('DB Transaction error');
                                        console.log(err2);
                                    }
                                });
                            }
                            else {
                                conn.release();
                                response.writeHead(500);
                                response.end('DB Transaction error');
                                console.log(trErr);
                            }
                        });
                    }
                    else {
                        conn.release();
                        response.writeHead(403);
                        response.end();
                    }
                }
                else {
                    conn.release();
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.post('/leave', function(request, response){
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let wid = request.body.wid;
    if(!wid) {
        response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select owner from t_workspace where id=?", wid, (err1, result1)=>{
                if(!err1) {
                    if(result1[0].owner === uid) {
                        conn.query("delete from t_workspace where id=?", wid, (err2, result2)=>{
                            if(!err2) {
                                response.writeHead(200);
                                response.end();
                            }
                            else {
                                response.writeHead(500);
                                response.end('DB query error');
                                console.log(err2);
                            }
                            conn.release();
                        });
                    }
                    else {
                        conn.query("delete from t_participation where uid=? and wid=?", [uid, wid], (err2, result2)=>{
                            if(!err2) {
                                response.writeHead(200);
                                response.end();
                            }
                            else {
                                response.writeHead(500);
                                response.end('DB query error');
                                console.log(err2);
                            }
                            conn.release();
                        });
                    }
                }
                else {
                    conn.release();
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                }
                
            });
            
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.post('/editParticipant', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let wid = parseInt(request.body.wid);
    let participant = parseInt(request.body.participant);
    let role = parseInt(request.body.role);
    let type = request.body.type;
    if(isNaN(wid) || isNaN(participant)) {
        response.writeHead(400);
        response.end();
        return;
    }
    if((type === '1' && isNaN(role)) || (type !== '1' && type !== '2')) {
        response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select owner from t_workspace where id = ?", wid, (err1, result1)=> {
                if(!err1) {
                    if(result1.length === 1) {
                        if(result1[0].owner !== participant) {
                            conn.query("select aid from t_auth_role_relation where rid = (select rid from t_participation where uid=? and wid=?)", [uid, wid], (err2, result2)=>{
                                if(!err2) {
                                    let authority = [];
                                    for(let auth of result2) {
                                        authority.push(auth.aid);
                                    }
                                    conn.query("select rid from t_participation where uid=? and wid=?", [participant, wid], (err3, result3)=>{
                                        if(!err3) {
                                            if(result3.length === 1) {
                                                let authorize = false;
                                                let minRole = result3[0].rid < role ? result3[0].rid : role;
                                                if(minRole >= 4) {//The user's role is writer or audience
                                                    authorize = (authority.indexOf(4) !== -1);
                                                }
                                                else if(minRole >= 2) {//The user's role is less than or equal to manager
                                                    authorize = (authority.indexOf(3) !== -1);
                                                }
                                                else {//The user's role is master
                                                    authorize = (authority.indexOf(1) !== -1);
                                                }
                                                if(authorize) {
                                                    if(type === '1') {//update
                                                        conn.query("update t_participation set rid=? where uid=? and wid=?", [role, participant, wid], (err4, result4)=> {
                                                            if(!err4) {
                                                                response.status(200).json({"uid": participant, "rid": role});
                                                            }
                                                            else {
                                                                response.writeHead(500);
                                                                response.end('DB query error');
                                                                console.log(err4);
                                                            }
                                                            conn.release();
                                                        });
                                                    }
                                                    else {//delete
                                                        conn.query("delete from t_participation where uid=? and wid=?", [participant, wid], (err4, result4)=> {
                                                            if(!err4) {
                                                                response.status(200).json({"uid": participant});
                                                            }
                                                            else {
                                                                response.writeHead(500);
                                                                response.end('DB query error');
                                                                console.log(err4);
                                                            }
                                                            conn.release();
                                                        });
                                                    }
                                                }
                                                else {
                                                    conn.release();
                                                    response.writeHead(403);
                                                    response.end();
                                                }
                                            }
                                            else {
                                                conn.release();
                                                response.writeHead(412);
                                                response.end('The user is not participant');
                                            }
                                        }
                                        else {
                                            conn.release();
                                            response.writeHead(500);
                                            response.end('DB query error');
                                            console.log(err3);
                                        }
                                    });
                                }
                                else {
                                    conn.release();
                                    response.writeHead(500);
                                    response.end('DB query error');
                                    console.log(err2);
                                }
                            });
                        }
                        else {
                            conn.release();
                            response.writeHead(403);
                            response.end('Owner cannot be changed');
                        }
                    }
                    else {
                        conn.release();
                        response.writeHead(412);
                        response.end('The workspace does not exist');
                    }
                }
                else {
                    conn.release();
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                }
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.get('/workspace', function(request, response) {
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
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select u.name, p.rid from (select id, name from t_user where id = ?) as u join t_participation as p on p.uid = u.id where p.wid = ?", [uid, wid], (err1, result1)=>{
                if(!err1) {
                    if(result1.length === 1) {
                        conn.query("select id, name, created_date, content, vr_options from t_workspace where id = ?", wid, (err2, result2)=> {
                            if(!err2) {
                                if(result2.length === 1) {
                                    conn.query("select * from t_auth_role_relation where rid = ?", result1[0].rid, (err3, result3)=>{
                                        if(!err3) {
                                            if(result3.length !== 0) {
                                                let content = '<a-entity><a-camera></a-camera></a-entity>' + result2[0].content;
                                                let wname = result2[0].name;
                                                let wcdate = result2[0].created_date;
                                                let rid = result3[0].rid;
                                                let canWrite = false;
                                                let canInvite = false;
                                                for(let r of result3) {
                                                    if(r.aid === 5)
                                                        canWrite = true;
                                                    else if(r.aid === 2)
                                                        canInvite = true;
                                                }
                                                fs.readFile(__dirname + '/public/workspace.ejs', 'utf8', (fsErr, workspace)=>{
                                                    if(!fsErr) {
                                                        response.writeHead(200, {'Content-Type': 'text/html'});
                                                        response.end(ejs.render(workspace, {uname: result1[0].name, wid: wid, wname: wname, created: wcdate, rid: rid, canWrite: canWrite, canInvite: canInvite, vrOptions: result2[0].vr_options, data: content}));
                                                        conn.query("update t_participation set access_date = NOW() where uid = ? and wid = ?", [uid, wid], (err4, result4)=>{
                                                            conn.release();
                                                        });
                                                    }
                                                    else {
                                                        conn.release();
                                                        response.writeHead(500);
                                                        response.end('Internal Server Error');
                                                        console.log(fsErr);
                                                    }
                                                });
                                            }
                                            else {
                                                conn.release();
                                                response.writeHead(403);
                                                response.end();
                                            }
                                        }
                                        else {
                                            conn.release();
                                            response.writeHead(500);
                                            response.end('DB query error');
                                            console.log(err3);
                                        }
                                    });
                                }
                                else {
                                    conn.release();
                                    response.writeHead(500);
                                    response.end('DB query error');
                                }
                            }
                            else {
                                conn.release();
                                response.writeHead(500);
                                response.end('DB query error');
                                console.log(err2);
                            }
                        });
                    }
                    else {
                        conn.release();
                        response.writeHead(403);
                        response.end();
                    }
                }
                else {
                    conn.release();
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                }
            });            
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.post('/save', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let wid = request.body.wid;
    let content = request.body.content;
	let vrOptions = request.body.vroptions;
    let screenshot = request.body.screenshot;
    if(!wid || !content || !screenshot) {
        response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("update t_workspace set content=?, vr_options=?, thumbnail=? where id = ?", [content, vrOptions, screenshot, wid], (err1, result1)=> {
                if(!err1) {
                    response.writeHead(200);
                    response.end();
					sessionManager.onSaved(uid, parseInt(wid));
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
                }
                conn.release();
            });
        }
        else {
            response.writeHead(500);
            response.end('Fail to connect DB');
            console.log(error);
        }
    });
});

app.get('/manageAssets', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    fs.readFile(__dirname + '/public/manageAssets.html', 'utf8', (error, data)=> {
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


//For redirect http to https, Check the redirect location
var httpServer = http.createServer(function (request, response) {
	response.writeHead(302, {'Location': 'https://192.168.1.51'});
	response.end();
}).listen(80, function() {
	console.log('Redirect server running');
});

var httpsServer = https.createServer(httpOptions, app).listen(443, function() {
    console.log('https server is running');
});

var io = require('socket.io')(httpsServer);
io.use(sharedSession(app.session, {autosave: true}));

class WSSession {
	constructor(wid) {
		console.log("New WSSession on " + wid);
		this.wid = wid;
		this.participantSocketsFromSessionName = new Map(); // {key:sessionName, value: socket}
		/*
        socket.userData = {
            sessionName : string,
            pose : {pos : float[3], rot : float[3]},
            canWrite : bool,
            avatarPath : string,
            mode : int(0:3D, 1:VR, 2:AR),
            enableSyncVRHand : bool,
            vrHandPose : {left : {pos : float[3] ,rot : float[4]}, right : {pos : float[3], rot : float[4]},
            vrHandGesture :int[2]([left, right])
        };
		*/
        this.token = null;
		this.streamerSocket = null;
		this.streamerOwner = null;
		this.workHistory = [];
	}

	onSaved() {
		this.workHistory = [];
		console.log('Workspace ' + this.wid + ' was saved');
		io.to(this.wid).emit('saved');
	}

	broadcast(socket, elId, typeNo, data) {
		socket.to(this.wid).emit('broadcasting', elId, typeNo, data);
	}

	join(socket, name, avatarPath, enableSyncVRHand){
        //For voice chat
		socket.on('voiceAnswer', (target, sdp)=>{
			let receiverSocket = this.participantSocketsFromSessionName.get(target);
			if(receiverSocket) {
				receiverSocket.emit('voiceAnswer', socket.userData.sessionName, sdp);
			}
		});
		socket.on('voiceOffer', (target, sdp)=>{
			let receiverSocket = this.participantSocketsFromSessionName.get(target);
			if(receiverSocket) {
				receiverSocket.emit('voiceOffer', socket.userData.sessionName, sdp);
			}
		});
		socket.on('voiceNewIceCandidate', (target, candidate)=>{
			let receiverSocket = this.participantSocketsFromSessionName.get(target);
			if(receiverSocket) {
				receiverSocket.emit('voiceNewIceCandidate', socket.userData.sessionName, candidate);
			}
		});

        //For receive AR surrounding stream
		socket.on('ArStreamAnswer', (sdp)=>{
			if (this.streamerSocket) {
				this.streamerSocket.emit('answer', socket.userData.sessionName, sdp.sdp);
			}
		});
		socket.on('ArStreamNewIceCandidate', (candidate)=>{
			if (this.streamerSocket) {
				this.streamerSocket.emit('newIceCandidate', socket.userData.sessionName, candidate.sdpMid, candidate.sdpMLineIndex, candidate.candidate);
			}
		});

        //For scene synchronization
		socket.on('work', (workUUID, elId, typeNo, data)=>{
			if(socket.userData.canWrite) {
				this.broadcast(socket, elId, typeNo, data);
				socket.emit('syncResult', workUUID, true);
				this.workHistory.push({elId:elId, typeNo:typeNo, data:data});
			}
			else {
				socket.emit('syncResult', workUUID, false);
			}
		});
		socket.on('changingTfm', (elementId, tfm)=> {
			if(socket.userData.canWrite) {
				this.broadcast(socket, elementId, 4, tfm);
			}
		});

        //For synchronize someone else's avatar
        socket.on('changeInteractionMode', (mode)=> {
            socket.userData.mode = mode;
            console.log(socket.userData.sessionName + ' mode : ' + mode);
            socket.to(this.wid).emit('userInteractionMode', {sessionName: socket.userData.sessionName, mode: mode});
        });
		socket.on('moving', (pose)=> {
			socket.userData.pose = pose;
			socket.to(this.wid).emit('userPose', {sessionName: socket.userData.sessionName, pose: pose});
		});
        socket.on('vrHandMoving', (vrHandPose)=> {
            if (!socket.userData.enableSyncVRHand || socket.userData.mode !== 1) return;
            socket.userData.vrHandPose = vrHandPose;
            socket.to(this.wid).emit('userHandPose', {sessionName: socket.userData.sessionName, vrHandPose: vrHandPose});
        });
        socket.on('vrHandGestureChanged', (handSide, gesture)=> {
            if (!socket.userData.enableSyncVRHand || socket.userData.mode !== 1) return;
            socket.userData.vrHandGesture[handSide] = gesture;
            socket.to(this.wid).emit('userHandGesture', {sessionName: socket.userData.sessionName, handSide: handSide, gesture: gesture});
        });

        //AR mode users request permission to share their surroundings
		socket.on('requireToken', ()=>{
			if(this.streamerSocket) { //already occupied
				socket.emit('token', 'unavailable');
			}
			else {
				this.token = uuidv4();
				this.streamerOwner = socket.userData.sessionName;
				socket.emit('token', this.token);
				console.log('Issued token(' + this.token + ') to ' + this.streamerOwner);
			}
		});

        //Create session name
		let dupNameList = [];
		for(let [key, val] of this.participantSocketsFromSessionName) {
			socket.emit('createUser', key, val.userData.avatarPath, val.userData.enableSyncVRHand);
			socket.emit('userPose', {sessionName: key, pose: val.userData.pose});
			let token = key.lastIndexOf('_');
			if(key.substring(0, token) === name) {
				dupNameList.push(parseInt(key.substring(token + 1)));
			}
		}
		dupNameList.sort((a, b) => {return a - b;});
		let sessionNumber = 0;
		for(sessionNumber = 0; sessionNumber < dupNameList.length; ++sessionNumber) {
			if(dupNameList[sessionNumber] !== sessionNumber) {
				break;
			}
		}
		let sessionName = name + '_' + sessionNumber;	

        //Synchronize changes to date
		for(let work of this.workHistory) {
			socket.emit('broadcasting', work.elId, work.typeNo, work.data);
		}
		for(let [key, val] of this.participantSocketsFromSessionName) {
			socket.emit('userPose', {sessionName: key, pose: val.userData.pose});
            if (val.userData.mode != 0) {
                socket.emit('userInteractionMode', {sessionName: key, mode: val.userData.mode});
                if(val.userData.mode === 1 && val.userData.enableSyncVRHand) {
                    if(val.userData.vrHandPose)
                        socket.emit('userHandPose', {sessionName: key, vrHandPose: val.userData.vrHandPose});
                    if(val.userData.vrHandGesture[0] !== 0)
                        socket.emit('userHandGesture', 0, val.userData.vrHandGesture[0]);
                    if(val.userData.vrHandGesture[1] !== 0)
                        socket.emit('userHandGesture', 1, val.userData.vrHandGesture[1]);
                }
            }
		}

        //Notification of new users to existing users
		socket.userData = {sessionName: sessionName, pose: {pos: [0.0, 0.0, 0.0], rot: [0.0, 0.0, 0.0]}, avatarPath: avatarPath, canWrite: false, mode: 0, enableSyncVRHand: enableSyncVRHand, vrHandPose: null, vrHandGesture: [0, 0]};
		this.participantSocketsFromSessionName.set(sessionName, socket);
		socket.join(this.wid);
		socket.to(this.wid).emit('createUser', sessionName, avatarPath, enableSyncVRHand);
		
        //AR Streaming reception that existed
        if(this.streamerSocket) {
			this.streamerSocket.emit('needToConn', sessionName);
		}
		socket.emit('sessionJoined', sessionName, enableSyncVRHand);
		
        //Check the new user has write auth
		dbPool.getConnection((error, conn)=>{
			if(!error) {
				conn.query('select aid from t_auth_role_relation where rid = (select rid from t_participation where uid = ? and wid = ?)', [socket.handshake.session.uid, this.wid], (err1, result1)=>{
					if(!err1) {
						for(let record of result1) {
							if(record.aid === 5) {
								socket.userData.canWrite = true;
								break;
							}
						}
					}
					else {
						console.log(err1);
					}
					conn.release();
				});
			}
			else {
				console.log(error);
			}
		});
	}

    //Join as dummy user for AR Streaming
	joinAsStreamer(socket, token) {
		if(this.token !== token)
			return false;
		this.streamerSocket = socket;
		socket.on('offer', (target, sdp) => {
			let receiverSocket = this.participantSocketsFromSessionName.get(target);
			if(receiverSocket) {
				receiverSocket.emit('ArStreamOffer', {type:'offer', sdp: sdp});
			}
		});
		socket.on('newIceCandidate', (target, sdpMid, sdpMLineIndex, candidate)=>{
			let receiverSocket = this.participantSocketsFromSessionName.get(target);
			if(receiverSocket) {
				receiverSocket.emit('ArStreamNewIceCandidate', {sdpMid:sdpMid, sdpMLineIndex:sdpMLineIndex, candidate:candidate});
			}
		});
		for(let [key, val] of this.participantSocketsFromSessionName) {
			if(this.streamerOwner !== key)
				socket.emit('needToConn', key);
		}
		return true;
	}

	leave(socket) {
		if(this.streamerSocket && this.streamerSocket.id === socket.id) {
			this.streamerSocket = null;
			this.streamerOwner = null;
			this.token = null;
			socket.to(this.wid).emit('ArStreamExpire');
		}
		else {
			io.to(this.wid).emit('removeUser', socket.userData.sessionName);
			if(this.streamerSocket && this.streamerOwner !== socket.userData.sessionName) {
				this.streamerSocket.emit('removeUser', socket.userData.sessionName);
			}
			this.participantSocketsFromSessionName.delete(socket.userData.sessionName);
		}
	}

	getPartNum() {
		return this.participantSocketsFromSessionName.size;
	}
};

class SessionManager {
	constructor() {
		let getWSSessionByWID = new Map(); // {key : wid, value : WSSession}
		this.isLiveSession = (wid)=>{
			if(getWSSessionByWID.get(wid))
				return true;
			return false;
		};
		this.onSaved = (uid, wid)=>{
			let sess = getWSSessionByWID.get(wid);
			if(sess) {
				sess.onSaved();
			}
		};
		io.on('connection', function(socket) {
			let uid = socket.handshake.session.uid;
			if(!uid || uid === '') {
				socket.disconnect(true);
				return;
			}
			dbPool.getConnection((error, conn)=>{
				if(!error) {
					conn.query("select t_user.name as name, model_path, vr_hand_sync from t_user join t_avatar on t_user.avatar_id = t_avatar.id where t_user.id = ?", uid, (err1, result1)=>{
						if(!err1) {
							let name = result1[0].name;
							let avatarPath = result1[0].model_path;
							let wsSession = null;
                            let enableSyncVRHand = (result1[0].vr_hand_sync[0] == 1);
							console.log('Socket connected : ' + name);
							
							socket.on('joinWS', (wid) => {
								wsSession = getWSSessionByWID.get(wid);
								if(!wsSession) {
									wsSession = new WSSession('' + wid);
									getWSSessionByWID.set(wid, wsSession);
								}
								wsSession.join(socket, name, avatarPath, enableSyncVRHand);
							});
							socket.on('joinWSasStreamer', (wid, token) => {
								wsSession = getWSSessionByWID.get(wid);
								name = token;
								if(!wsSession || !wsSession.joinAsStreamer(socket, token)) {
									socket.disconnect(true);
									wsSession = null;
								}
							});
							socket.on('disconnect', () => {
								console.log('socket disconnected : ' + name);
								if(wsSession) {
									console.log('Leave ' + name + ' from ' + wsSession.wid);
									wsSession.leave(socket);
									if(wsSession.getPartNum() === 0) {
										getWSSessionByWID.delete(parseInt(wsSession.wid));
										wsSession = null;
									}
								}
							});
						}
						else {
							console.log(err1);
						}
						conn.release();
					});
				}
				else {
					console.log(error);
				}
			});
		});
	}
};

var sessionManager = new SessionManager();