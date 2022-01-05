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
app.use(bodyParser.urlencoded({ extended: false }));
// parse application/json
app.use(bodyParser.json());
app.session = session({
    secret: '@dFaL^ASdD!*',
    resave: false,
    saveUninitialized: true
});
app.use(app.session);
app.use(express.static(__dirname + '/public'));

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
                            conn.query("update t_user set name=?, email=?, avatar_id=? where id=?", [name, email, avatar_id, uid], (err2, result2)=>{
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

app.get('/assetInfo', function(request, response){ 
    let uid = request.session.uid;
    let id = null;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    if(request.query.id) {
        id = parseInt(request.query.id);
        if(isNaN(id)) {
            response.writeHead(400);
            response.end();
            return;
        }
    }
    dbPool.getConnection((error, conn)=>{
        if(!error) {
            conn.query("select * from t_asset_item where parent_dir " + (id ? "= " + id : "is NULL") + " and (owner_id is NULL or owner_id = ?)", uid, (err1, result1)=>{
                if(!err1) {
                    let bottomUpSearch = (pathArr)=>{
                        let assetId = pathArr[0].id;
                        if(!assetId) {
                            pathArr[0].name = 'assets';
                            if(pathArr.length === 1)
                                pathArr[0].name += 'du';
                            let curItemName = pathArr[pathArr.length - 1].name;
                            let isPrivate = false;
                            let assetType = curItemName[curItemName.length - 2];
                            if(curItemName[curItemName.length - 1] === 'r')
                                isPrivate = true;
                            pathArr[pathArr.length - 1].name = curItemName.slice(0, -2);
                            let prom1 = new Promise((resolve, reject) => {
                                if(id) {
                                    conn.query("select id, name, email from t_user as u join t_asset_share as ash on u.id = ash.uid where ash.as_id = ?", id, (err3, result3)=>{
                                        if(!err3) {
                                            resolve(result3);
                                        }
                                        else {
                                            reject(err3);
                                        }
                                    });
                                }
                                else {
                                    resolve([]);
                                }
                            });
                            let prom2 = new Promise((resolve, reject)=>{
                                switch(assetType) {
                                case 'd':
                                    resolve(null);
                                    break;
                                case 't':
                                    //feature meta data array
                                    conn.query("select 'vuforia_feature' as feature_type, type, hex(left(dat, 4)) as signature from t_vuforia_feature where id = ? union all select 'general_feature' as feature_type, type, hex(left(bin, 4)) as signature from t_general_feature where id = ?", [id, id], (err3, result3)=>{
                                        if(!err3) {
                                            resolve(result3);
                                        }
                                        else {
                                            reject(err3);
                                        }
                                    });
                                    break;
                                case 'b':
                                    //binary data size
                                    conn.query("select length(data) as size, hex(left(data, 4)) as signature from t_binary_data where id = ?", id, (err3, result3)=>{
                                        if(!err3) {
                                            if(result3.length === 1)
                                                resolve(result3[0]);
                                            else
                                                resolve(null);
                                        }
                                        else {
                                            reject(err3);
                                        }
                                    });
                                    break;
								case 'c':
									//content source
									conn.query("select data from t_template where id = ?", id, (err3, result3)=>{
										if(!err3) {
											if(result3.length === 1)
												resolve(result3[0]);
											else
												resolve(null);
										}
										else {
											reject(err3);
										}
									});
									break;
								}
                            });
                            Promise.allSettled([prom1, prom2]).then((results)=>{
                                let errAny = false;
                                let toResp = {'pathArr' : pathArr, 'children' : result1, 'isPrivate' : isPrivate, 'assetType' : assetType};
                                if(results[0].status === 'fulfilled')
                                    toResp.shareTo = results[0].value;
                                else
                                    errAny = true;
                                if(results[1].status === 'fulfilled')
                                    toResp.metaData = results[1].value;
                                else
                                    errAny = true;
                                if(!errAny) {
                                    response.status(200).json(toResp);
                                }
                                else {
                                    response.writeHead(500);
                                    response.end('DB query Error');
                                    console.log(results[0].reason);
                                    console.log(results[1].reason);
                                }
                                conn.release();
                            });
                            return;
                        }
                        conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?)", [assetId, uid], (err2, result2)=>{
                            if(!err2) {
                                if(result2.length === 1) {
                                    if(pathArr.length === 1) {
                                        let types = ['d', 't', 'b', 'c'];
                                        result2[0].name += types[result2[0].item_type];
                                        if(result2[0].owner_id)
                                            result2[0].name += 'r';
                                        else
                                            result2[0].name += 'u';
                                    }
                                    pathArr[0].name = result2[0].name;
                                    pathArr.unshift({'id':result2[0].parent_dir, 'name':null});
                                    bottomUpSearch(pathArr);
                                }
                                else {
                                    response.writeHead(404);
                                    response.end();
                                    conn.release();
                                }
                            }
                            else {
                                response.writeHead(500);
                                response.end('DB query error');
                                console.log(err2);
                                conn.release();
                            }
                        });
                    };
                    bottomUpSearch([{'id':id, 'name':null}]);
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
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

app.post('/makeDirectory', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let parentId = parseInt(request.body.parentId);
	let astName = request.body.astName;
	if(isNaN(parentId) || !astName) {
		response.writeHead(400);
		response.end();
		return;
	}
	dbPool.getConnection((error, conn)=>{
        if(!error) {
            conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0", [parentId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1.length === 1) {
                        conn.query("insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 0)", [astName, parentId, result1[0].owner_id], (err2, result2)=>{
							if(!err2) {
								response.status(200).json({'id':result2.insertId, 'name':astName, 'parent_dir':parentId, 'owner_id':result1[0].owner_id, 'item_type':0});
							}
							else {
								if(err2.errno === 1169) {
									response.writeHead(412);
									response.end('duplicated name');
								}
								else {
									response.writeHead(500);
									response.end('DB query error');
									console.log(err2);
								}
							}
							conn.release();
						});
                    }
                    else {
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized directory');
                        conn.release();
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
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

app.post('/makeBinaryFromURI', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let parentId = parseInt(request.body.parentId);
	let astName = request.body.astName;
	let srcURI = request.body.srcURI;
	if(isNaN(parentId) || !astName || !srcURI) {
		response.writeHead(400);
		response.end();
		return;
	}
	dbPool.getConnection((error, conn)=>{
		if(!error) {
			conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0", [parentId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1.length === 1) {
						conn.beginTransaction((trErr)=>{
							if(!trErr) {
								conn.query("insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 2)", [astName, parentId, result1[0].owner_id], (err2, result2)=>{
									if(!err2) {
										if(srcURI.startsWith('http')) {
											let httpCl = http;
											if(srcURI.startsWith('https'))
												httpCl = https;
											httpCl.get(srcURI, (res)=>{
											   if(res.statusCode !== 200) {
												   res.resume();
												   console.log('Response status err');
												   return;
											   }
											   conn.query("insert into t_binary_data(id, data) values(?, ?)", [result2.insertId, res], (err3, result3)=>{
												   if(!err3) {
													   response.status(200).json({'id':result2.insertId, 'name':astName, 'parent_dir':parentId, 'owner_id':result1[0].owner_id, 'item_type':2});
													   conn.commit();
												   }
												   else {
													   response.writeHead(500);
													   response.end('DB query error');
													   console.log(err3);
													   conn.rollback();
													   console.log('QueryError');
												   }
												   conn.release();
											   });
											}).on('error', ()=>{
												conn.rollback();
												conn.release();
												console.log('RequestError');
											});
										}
									}
									else {
										if(err2.errno === 1169) {
											response.writeHead(412);
											response.end('Duplicated name');
										}
										else {
											response.writeHead(500);
											response.end('DB query error');
											console.log(err2);
										}
										conn.release();
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
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized directory');
                        conn.release();
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
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

app.post('/makeBinaryFromUpload', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let parentId;
	let astName;
	let form = new multiparty.Form();
	form.on('field', (name, value)=>{
		if(name === 'parentId') {
			parentId = parseInt(value);
		}
		else if(name === 'astName') {
			astName = value;
		}
	});
	form.on('part', (partDataStream)=>{
		if(partDataStream.name !== 'src') {
			partDataStream.resume();
			return;
		}
		if(isNaN(parentId) || !astName) {
			partDataStream.resume();
			response.writeHead(400);
			response.end();
			return;
		}
		dbPool.getConnection((error, conn)=>{
			if(!error) {
				conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0", [parentId, uid], (err1, result1)=>{
					if(!err1) {
						if(result1.length === 1) {
							conn.beginTransaction((trErr)=>{
								if(!trErr) {
									conn.query("insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 2)", [astName, parentId, result1[0].owner_id], (err2, result2)=>{
										if(!err2) {
											conn.query("insert into t_binary_data(id, data) values(?, ?)", [result2.insertId, partDataStream], (err3, result3)=>{
											   if(!err3) {
												   response.status(200).json({'id':result2.insertId, 'name':astName, 'parent_dir':parentId, 'owner_id':result1[0].owner_id, 'item_type':2});
												   conn.commit();
											   }
											   else {
												   response.writeHead(500);
												   response.end('DB query error');
												   console.log(err3);
												   conn.rollback();
												   console.log('QueryError');
											   }
											   conn.release();
										   });
										}
										else {
											if(err2.errno === 1169) {
												response.writeHead(412);
												response.end('Duplicated name');
											}
											else {
												response.writeHead(500);
												response.end('DB query error');
												console.log(err2);
											}
											conn.release();
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
							response.writeHead(412);
							response.end('Nonexistent or unauthorized directory');
							conn.release();
						}
					}
					else {
						response.writeHead(500);
						response.end('DB query error');
						console.log(err1);
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
	form.parse(request);
});

//Create an abstract target
app.post('/makeTarget', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let parentId = parseInt(request.body.parentId);
	let astName = request.body.astName;
	if(isNaN(parentId) || !astName) {
		response.writeHead(400);
		response.end();
		return;
	}
	dbPool.getConnection((error, conn)=>{
        if(!error) {
            conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0", [parentId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1.length === 1) {
                        conn.query("insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 1)", [astName, parentId, result1[0].owner_id], (err2, result2)=>{
							if(!err2) {
								response.status(200).json({'id':result2.insertId, 'name':astName, 'parent_dir':parentId, 'owner_id':result1[0].owner_id, 'item_type':1});
							}
							else {
								if(err2.errno === 1169) {
									response.writeHead(412);
									response.end('Duplicated name');
								}
								else {
									response.writeHead(500);
									response.end('DB query error');
									console.log(err2);
								}
							}
							conn.release();
						});
                    }
                    else {
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized directory');
                        conn.release();
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
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

//Currently only supports 2d images
app.post('/makeTargetGeneralFeature', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let targetId;
	let width;
	let form = new multiparty.Form();
	form.on('field', (name, value)=>{
		if(name === 'targetId') {
			targetId = parseInt(value);
		}
		else if(name === 'width') {
			width = parseFloat(value);
		}
	});
	form.on('part', (partDataStream)=>{
		if(partDataStream.name !== 'src') {
			partDataStream.resume();
			return;
		}
		if(isNaN(targetId) || isNaN(width)) {
			partDataStream.resume();
			response.writeHead(400);
			response.end();
			return;
		}
		dbPool.getConnection((error, conn)=>{
			if(!error) {
				conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 1", [targetId, uid], (err1, result1)=>{
					if(!err1) {
						if(result1.length === 1) {
							conn.beginTransaction((trErr)=>{
								if(!trErr) {
									conn.query("delete from t_general_feature where id = ?", targetId, (err2, result2)=>{
										if(!err2) {
											conn.query("insert into t_general_feature(id, type, width, bin) values(?, '2d', ?, ?)", [targetId, width, partDataStream], (err3, result3)=>{
												if(!err3) {
													conn.commit();
													conn.query("select type, hex(left(bin, 4)) as signature from t_general_feature where id = ?", targetId, (err4, result4)=>{
														if(!err4 && result4.length === 1) {
															response.status(200).json(result4[0]);
														}
														else {
															response.writeHead(200);
															response.end();
															console.log(err4);
														}
														conn.release();
													});
												}
												else {
													response.writeHead(500);
													response.end('DB query error');
													console.log(err3);
													conn.rollback();
													conn.release();
												}
											});
										}
										else {
											response.writeHead(500);
											response.end('DB query Error');
											console.log(err2);
											conn.release();
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
							response.writeHead(412);
							response.end('Nonexistent or unauthorized target');
							conn.release();
						}
					}
					else {
						response.writeHead(500);
						response.end('DB query error');
						console.log(err1);
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
	form.parse(request);
});

app.post('/makeTargetVuforiaFeature', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let targetId;
	let type;
	let xmlStream;
	let form = new multiparty.Form();
	form.on('field', (name, value)=>{
		if(name === 'targetId') {
			targetId = parseInt(value);
		}
		else if(name === 'type') {
			type = value;
		}
	});
	form.on('part', (partDataStream)=> {
		if(partDataStream.name === 'xml') {
			xmlStream = partDataStream;
		}
		else if(partDataStream.name === 'dat'){
			if(isNaN(targetId) || !type || !xmlStream) {
				partDataStream.resume();
				response.writeHead(400);
				response.end();
				return;
			}
			dbPool.getConnection((error, conn)=>{
				if(!error) {
					conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 1", [targetId, uid], (err1, result1)=>{
						if(!err1) {
							if(result1.length === 1) {
								conn.beginTransaction((trErr)=>{
									if(!trErr) {
										conn.query("delete from t_vuforia_feature where id = ?", targetId, (err2, result2)=>{
											if(!err2) {
												conn.query("insert into t_vuforia_feature(id, type, xml, dat) values(?, ?, ?, ?)", [targetId, type, xmlStream, partDataStream], (err3, result3)=>{
													if(!err3) {
														conn.commit();
														conn.query("select type, hex(left(dat,4)) as signature from t_vuforia_feature where id = ?", targetId, (err4, result4)=>{
															if(!err4 || result4.length === 1) {
																response.status(200).json(result4[0]);
															}
															else {
																response.writeHead(200);
																response.end();
																console.log(err4);
															}
															conn.release();
														});
													}
													else {
														response.writeHead(500);
														response.end('DB query Error');
														console.log(err3);
														conn.rollback();
														conn.release();
													}
												});
											}
											else {
												response.writeHead(500);
												response.end('DB query Error');
												console.log(err2);
												conn.release();
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
								response.writeHead(412);
								response.end('Nonexistent or unauthorized target');
								conn.release();
							}
						}
						else {
							response.writeHead(500);
							response.end('DB query error');
							console.log(err1);
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
		}
		else {
			response.writeHead(400);
			response.end();
		}
	});
	form.parse(request);
});

app.post('/makeTemplate', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let parentId = parseInt(request.body.parentId);
	let astName = request.body.astName;
	if(isNaN(parentId) || !astName) {
		response.writeHead(400);
		response.end();
		return;
	}
	dbPool.getConnection((error, conn)=>{
        if(!error) {
            conn.query("select * from t_asset_item where id = ? and (owner_id is NULL or owner_id = ?) and item_type = 0", [parentId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1.length === 1) {
						conn.beginTransaction((trErr)=>{
							if(!trErr) {
								conn.query("insert into t_asset_item(name, parent_dir, owner_id, item_type) values(?, ?, ?, 3)", [astName, parentId, result1[0].owner_id], (err2, result2)=>{
									if(!err2) {
										conn.query("insert into t_template(id, data, verified) values(?, '', b'0')", result2.insertId, (err3, result3)=>{
											if(!err3) {
												conn.commit();
												response.status(200).json({'id':result2.insertId, 'name':astName, 'parent_dir':parentId, 'owner_id':result1[0].owner_id, 'item_type':3});
											}
											else {
												conn.rollback();
												response.writeHead(500);
												response.end('DB query error');
												console.log(err3);
											}
											conn.release();
										});
									}
									else {
										if(err2.errno === 1169) {
											response.writeHead(412);
											response.end('Duplicated name');
										}
										else {
											response.writeHead(500);
											response.end('DB query error');
											console.log(err2);
										}
										conn.rollback();
										conn.release();
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
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized directory');
                        conn.release();
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
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

app.post('/commitContent', function(request, response){
	let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
	let astId = parseInt(request.body.astId);
	if(isNaN(astId)) {
		response.writeHead(400);
		response.end();
		return;
	}
	let contentSource = request.body.source;
	contentSource = contentSource.replace(/'/g, '"');
	//todo : Check content source validation
	dbPool.getConnection((error, conn)=>{
		if(!error) {
			conn.query("update t_template set data = ?, verified = b'1' where id = ?", [contentSource, astId], (err1, result1)=>{
				if(!err1) {
					response.writeHead(200);
					response.end();
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

app.post('/removeAsset', function(request, response){
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let astId = request.body.astId;
    if(!astId) 
    {   response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("delete from t_asset_item where id = ? and parent_dir is not null and (owner_id is null or owner_id = ?)", [astId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1.affectedRows !== 0) {
                        response.writeHead(200);
                        response.end();
                    }
                    else {
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized asset');
                    }
                    conn.release();
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
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

app.post('/renameAsset', function(request, response){
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let astId = request.body.astId;
    let astName = request.body.astName;
    if(!astId || !astName) {
        response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("update t_asset_item set name = ? where id = ? and parent_dir is not null and (owner_id is null or owner_id = ?)", [astName, astId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1.affectedRows !== 0) {
                        response.writeHead(200);
                        response.end();
                    }
                    else {
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized asset');
                    }
                    conn.release();
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
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

app.post('/shareAsset', function(request, response){
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let astId = request.body.astId;
    let targets = request.body.targets;
    if(!astId || !targets) {
        response.writeHead(400);
        response.end();
        return;
    }
    if(typeof targets === 'string') {
        targets = [targets];
    }
    if(!(targets instanceof Array)) {
        response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select count(*) as canShare from t_asset_item where id = ? and owner_id = ?", [astId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1[0].canShare === 1) {
                        let proms = [];
                        for(let target of targets) {
                            proms.push(new Promise((resolve, reject)=>{
                                if(typeof target !== 'string')
                                    reject('Nonexistent user');
                                let isEmail = target.indexOf('@') !== -1;
                                conn.query("select id, name, email from t_user where " + (isEmail ? "email" : "name") + " = ?", target, (err2, result2)=>{
                                    if(!err2) {
                                        if(result2.length === 1) {
                                            conn.query("insert into t_asset_share(as_id, uid) values(?, ?)", [astId, result2[0].id], (err3, result3)=>{
                                                if(!err3) {
                                                    resolve(result2[0]);
                                                }
                                                else {
                                                    if(err3.errno === 1169) {
                                                        reject('Already shared');
                                                    }
                                                    else {
                                                        reject('DB query error');
                                                        console.log(err3);
                                                    }
                                                }
                                            });
                                        }
                                        else {
                                            reject('Nonexistent user');
                                        }
                                    }
                                    else {
                                        reject('DB query error');
                                        console.log(err2);
                                    }
                                });
                            }));
                        }
                        Promise.allSettled(proms).then((results)=>{
                            conn.release();
                            let affectedPersons = [];
                            for(let r of results) {
                                if(r.status === 'fulfilled')
                                    affectedPersons.push(r.value);
                            }
                            response.status(200).json(affectedPersons);
                        });
                    }
                    else {
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized asset');
                        conn.release();
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
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

app.post('/unshareAsset', function(request, response){
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let astId = request.body.astId;
    let targetId = request.body.targetId;
    if(!astId || !targetId) {
        response.writeHead(400);
        response.end();
        return;
    }
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            conn.query("select count(*) as canShare from t_asset_item where id = ? and owner_id = ?", [astId, uid], (err1, result1)=>{
                if(!err1) {
                    if(result1[0].canShare === 1) {
                        conn.query("delete from t_asset_share where as_id = ? and uid = ?", [astId, targetId], (err2, result2)=>{
                            if(!err2) {
                                if(result2.affectedRows === 1) {
                                    response.writeHead(200);
                                    response.end();
                                }
                                else {
                                    response.writeHead(412);
                                    response.end('Already unshared');
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
                        response.writeHead(412);
                        response.end('Nonexistent or unauthorized asset');
                        conn.release();
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
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

app.get('/assetRawData', function(request, response) {
	let uid = request.session.uid;
	if(!uid) {
		response.writeHead(401);
		response.end();
		return;
	}
	let assetId = parseInt(request.query.assetId);
	let featureType = request.query.featureType;
	if(isNaN(assetId)) {
		response.writeHead(400);
		response.end();
		return;
	}
	dbPool.getConnection((error, conn)=> {
		if(!error) {
			let bottomUpAuthAndRead = (id, auth) => {
				if(id === null) {
					if(auth === 1) {
						conn.query("select name, item_type from t_asset_item where id = ?", assetId, (err2, result2)=>{
							if(!err2 && result2.length === 1) {
								switch(result2[0].item_type) {
								case 0:
									response.writeHead(412);
									response.end('It is directory');
									conn.release();
									break;
								case 1:
									if(featureType) {
										switch(featureType) {
										case 'general_feature':
											conn.query("select bin from t_general_feature where id = ?", assetId, (err3, result3)=>{
												if(!err3 && result3.length === 1) {
													response.setHeader('Content-disposition', 'filename=' + result2[0].name + '/genereal');
													response.end(result3[0].bin, 'binary');
												}
												else {
													response.writeHead(500);
													response.end('DB query error');
													console.log(err3);
												}
												conn.release();
											});
											break;
										case 'vuforia_feature':
											conn.query("select dat from t_vuforia_feature where id = ?", assetId, (err3, result3)=>{
												if(!err3 && result3.length === 1) {
													response.setHeader('Content-disposition', 'attachment; filename=' + result2[0].name + '/vuforia.dat');
													response.end(result3[0].dat, 'binary');
												}
												else {
													response.writeHead(500);
													response.end('DB query error');
													console.log(err3);
												}
												conn.release();
											});
											break;
										}
									}
									else {
										response.writeHead(400);
										response.end();
										conn.release();
									}
									break;
								case 2:
									conn.query("select data from t_binary_data where id = ?", assetId, (err3, result3)=>{
										if(!err3 && result3.length === 1) {
											response.setHeader('Content-disposition', 'attachment; filename=' + result2[0].name);
											response.end(result3[0].data, 'binary');
										}
										else {
											response.writeHead(500);
											response.end('DB query error');
											console.log(err3);
										}
										conn.release();
									});
									break;
								case 3:
									conn.query("select data from t_template where id = ?", assetId, (err3, result3)=>{
										if(!err3 && result3.length === 1) {
											response.setHeader('Content-disposition', 'attachment; filename=' + result2[0].name);
											response.end(result3[0].data, 'binary');
										}
										else {
											response.writeHead(500);
											response.end('DB query error');
											console.log(err3);
										}
										conn.release();
									});
									break;
								}
							}
							else {
								response.writeHead(500);
								response.end('DB query error');
								console.log(err2);
								conn.release();
							}
						});
					}
					else {
						response.writeHead(404);
						response.end();
						conn.release();
					}
					return;
				}
				conn.query("select parent_dir, (owner_id is null or owner_id = ? or (select count(*) from t_asset_share where as_id = id and uid = ?)) as auth from t_asset_item where id = ?", [uid, uid, id], (err1, result1)=> {
					if(!err1) {
						if(result1.length === 1) {
                            bottomUpAuthAndRead(result1[0].parent_dir, result1[0].auth | auth);
						}
						else {
							response.writeHead(404);
							response.end();
							conn.release();
						}
					}
					else {
						response.writeHead(500);
						response.end();
						console.log(err1);
						conn.release();
					}
				});
			};
			bottomUpAuthAndRead(assetId, 1);
		}
		else {
			response.writeHead(500);
			response.end('Fail to connect DB');
			console.log(error);
		}
	});
});

app.get('/assets/:path([^/]+(?:/[^/]+)*)', function(request, response) {
    let uid = request.session.uid;
    if(!uid) {
        response.writeHead(401);
        response.end();
        return;
    }
    let pathStr = request.params.path;
    // If it is target feature, A suffix such as /general or /vuforia is appended to the passed path
    let pathArr = pathStr.split('/');
    dbPool.getConnection((error, conn)=> {
        if(!error) {
            //It is assumed that the home directory cannot be shared.
            conn.query("select id, (owner_id is null or owner_id = ?) as auth from t_asset_item where parent_dir is null and name = ?", [uid, pathArr[0]], (err1, result1)=>{
                if(!err1) {
                    if(result1.length === 1) {
                        let topdownSearch = (prevResult, depth) => {
                            if(depth === pathArr.length - 1 && prevResult[0].item_type) { //request target feature
								if(prevResult[0].auth === 1) {
									switch(pathArr[depth]) {
									case 'general':
										conn.query("select * from t_general_feature where id = ?", prevResult[0].id, (err3, result3)=>{
											if(!err3) {
												if(result3.length === 1) {
													response.writeHead(200);
													if(result3[0].type === '2d') {
														response.write(Buffer.alloc(1, 0));
													}
													else if(result3[0].type === '3d') {
														response.write(Buffer.alloc(1, 1));
													}
													else {
														response.write(Buffer.alloc(1, 255));
													}
													const dv = new DataView(new ArrayBuffer(4));
													dv.setFloat32(0, result3[0].width, false);
													response.write(Buffer.from(new Uint8Array(dv.buffer)), 'binary');
													dv.setFloat32(0, result3[0].height, false);
													response.write(Buffer.from(new Uint8Array(dv.buffer)), 'binary');
													dv.setFloat32(0, result3[0].depth, false);
													response.write(Buffer.from(new Uint8Array(dv.buffer)), 'binary');
													response.end(result3[0].bin, 'binary');
												}
												else {
													response.writeHead(412);
													response.end('The target has not general feature');
												}
											}
											else {
												response.writeHead(500);
												response.end('DB query error');
												console.log(err3);
											}
											conn.release();
										});
										break;
									case 'vuforia':
										//todo : unit test
										conn.query("select type, xml, length(xml) as len, dat from t_vuforia_feature where id = ?", prevResult[0].id, (err3, result3)=>{
											if(!err3) {
												if(result3.length === 1) {
													response.writeHead(200);
													switch(result3[0].type) {
													case 'SingleImage':
														response.write(Buffer.alloc(1, 0));
														break;
													case 'Cuboid':
														response.write(Buffer.alloc(1, 1));
														break;
													case 'Cylinder':
														response.write(Buffer.alloc(1, 2));
														break;
													case '3DObject':
														response.write(Buffer.alloc(1, 3));
														break;
													}
													const dv = new DataView(new ArrayBuffer(2));
													dv.setUint16(0, result3[0].len, false);
													response.write(Buffer.from(new Uint8Array(dv.buffer)), 'binary');
													response.write(result3[0].xml, 'binary');
													response.end(result3[0].dat, 'binary');
												}
												else {
													response.writeHead(412);
													response.end('The target has not general feature');
												}
											}
											else {
												response.writeHead(500);
												response.end('DB query error');
												console.log(err3);
											}
										});
										break;
									}
								}
								else {
									response.writeHead(404);
                                    response.end();
                                    conn.release();
								}
								return;
							}
							else if(depth === pathArr.length) {
                                if(prevResult[0].auth === 1) {
                                    if(prevResult[0].item_type === 2) {
										conn.query("select data from t_binary_data where id = ?", prevResult[0].id, (err3, result3)=>{
                                            if(!err3 && result3.length === 1) {
                                                response.writeHead(200);
                                                response.end(result3[0].data, 'binary');
                                            }
                                            else {
                                                response.writeHead(500);
                                                response.end('DB query error');
                                                console.log(err3);
                                            }
                                            conn.release();
                                        });
									}
									else if(prevResult[0].item_type === 3) {
										conn.query("select data from t_template where id = ?", prevResult[0].id, (err3, result3)=>{
											if(!err3 && result3.length === 1) {
                                                response.writeHead(200);
                                                response.end(result3[0].data, 'binary');
                                            }
                                            else {
                                                response.writeHead(500);
                                                response.end('DB query error');
                                                console.log(err3);
                                            }
                                            conn.release();
										});
									}
									else {
										response.writeHead(412);
                                        response.end('not file');
                                        conn.release();
									}
                                }
                                else {
                                    response.writeHead(404);
                                    response.end();
                                    conn.release();
                                }
                                return;
                            }

                            let name = pathArr[depth];
                            let parentId = prevResult[0].id;
                            conn.query("select id, (owner_id is null or owner_id = ? or (select count(*) from t_asset_share where as_id = id and uid = ?)) as auth, item_type from t_asset_item where parent_dir = ? and name = ?", [uid, uid, parentId, name], (err2, result2)=>{
                                if(!err2) {
                                    if(result2.length === 1) {
                                        result2[0].auth |= prevResult[0].auth;
                                        topdownSearch(result2, depth + 1);
                                    }
                                    else {
                                        response.writeHead(404);
                                        response.end();
                                        conn.release();
                                    }
                                }
                                else {
                                    response.writeHead(500);
                                    response.end();
                                    console.log(err2);
                                    conn.release();
                                }
                            });
                        };
                        topdownSearch(result1, 1);
                    }
                    else {
                        response.writeHead(404);
                        response.end();
                        conn.release();
                    }
                }
                else {
                    response.writeHead(500);
                    response.end('DB query error');
                    console.log(err1);
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

app.get('/360video', function(request, response){

    fs.readFile(__dirname + '/public/360video.html', 'utf8', (error, data)=> {
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