var express = require('express');
var fs = require('fs');
var ejs = require('ejs');

// get DBpool module
var dbPool = require('../DBpool').dbPool;

var router = express.Router();

router.get('/makePage', function(request, response) {
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

router.post('/make', function(request, response) { // todo: Check the content source validation
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

router.post('/removeWorkspace', function(request, response) {
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


router.post('/setBookmark', function(request, response) {
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

router.get('/wsList', function(request, response) {
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


router.post('/invite', function(request, response) {
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

router.post('/join', function(request, response) {
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

router.post('/removeInvite', function(request, response) {
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


router.get('/manage', function(request, response) {
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

router.post('/alter', function(request, response){ //todo: Check the content source validation
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

router.post('/leave', function(request, response){
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

router.post('/editParticipant', function(request, response) {
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


router.post('/save', function(request, response) {
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

module.exports = router;