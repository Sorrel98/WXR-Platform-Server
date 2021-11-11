﻿var http = require('http');
var https = require('https');
var express = require('express');
var fs = require('fs');
var session = require('express-session');
var sharedSession = require('express-socket.io-session');
var ejs = require('ejs');
var uuidv4 = require('uuid').v4;

// get DBpool module
var dbPool = require('./DBpool').dbPool;

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