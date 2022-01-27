const uuidv4 = require('uuid').v4;

const dbPool = require('./lib/DBpool').dbPool;


class WSSession {
	constructor(wid) {
		console.log(`New WSSession on ${wid}`);
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
		console.log(`'Workspace ${this.wid} was saved'`);
		io.to(this.wid).emit('saved');
	}

	broadcast(socket, elId, typeNo, data) {
		socket.to(this.wid).emit('broadcasting', elId, typeNo, data);
	}

	async join(socket, name, avatarPath, enableSyncVRHand) {
		//For voice chat
		socket.on('voiceAnswer', (target, sdp) => {
			let receiverSocket = this.participantSocketsFromSessionName.get(target);
			if (receiverSocket) {
				receiverSocket.emit('voiceAnswer', socket.userData.sessionName, sdp);
			}
		});
		socket.on('voiceOffer', (target, sdp) => {
			let receiverSocket = this.participantSocketsFromSessionName.get(target);
			if (receiverSocket) {
				receiverSocket.emit('voiceOffer', socket.userData.sessionName, sdp);
			}
		});
		socket.on('voiceNewIceCandidate', (target, candidate) => {
			let receiverSocket = this.participantSocketsFromSessionName.get(target);
			if (receiverSocket) {
				receiverSocket.emit('voiceNewIceCandidate', socket.userData.sessionName, candidate);
			}
		});

		//For receive AR surrounding stream
		socket.on('ArStreamAnswer', (sdp) => {
			if (this.streamerSocket) {
				this.streamerSocket.emit('answer', socket.userData.sessionName, sdp.sdp);
			}
		});
		socket.on('ArStreamNewIceCandidate', (candidate) => {
			if (this.streamerSocket) {
				this.streamerSocket.emit('newIceCandidate', socket.userData.sessionName, candidate.sdpMid, candidate.sdpMLineIndex, candidate.candidate);
			}
		});

		//For scene synchronization
		socket.on('work', (workUUID, elId, typeNo, data) => {
			if (socket.userData.canWrite) {
				this.broadcast(socket, elId, typeNo, data);
				socket.emit('syncResult', workUUID, true);
				this.workHistory.push({ elId: elId, typeNo: typeNo, data: data });
			}
			else {
				socket.emit('syncResult', workUUID, false);
			}
		});
		socket.on('changingTfm', (elementId, tfm) => {
			if (socket.userData.canWrite) {
				this.broadcast(socket, elementId, 4, tfm);
			}
		});

		//For synchronize someone else's avatar
		socket.on('changeInteractionMode', (mode) => {
			socket.userData.mode = mode;
			console.log(`${socket.userData.sessionName} mode : ${mode}`);
			socket.to(this.wid).emit('userInteractionMode', { sessionName: socket.userData.sessionName, mode: mode });
		});
		socket.on('moving', (pose) => {
			socket.userData.pose = pose;
			socket.to(this.wid).emit('userPose', { sessionName: socket.userData.sessionName, pose: pose });
		});
		socket.on('vrHandMoving', (vrHandPose) => {
			if (!socket.userData.enableSyncVRHand || socket.userData.mode !== 1) return;
			socket.userData.vrHandPose = vrHandPose;
			socket.to(this.wid).emit('userHandPose', { sessionName: socket.userData.sessionName, vrHandPose: vrHandPose });
		});
		socket.on('vrHandGestureChanged', (handSide, gesture) => {
			if (!socket.userData.enableSyncVRHand || socket.userData.mode !== 1) return;
			socket.userData.vrHandGesture[handSide] = gesture;
			socket.to(this.wid).emit('userHandGesture', { sessionName: socket.userData.sessionName, handSide: handSide, gesture: gesture });
		});

		//AR mode users request permission to share their surroundings
		socket.on('requireToken', () => {
			if (this.streamerSocket) { //already occupied
				socket.emit('token', 'unavailable');
			}
			else {
				this.token = uuidv4();
				this.streamerOwner = socket.userData.sessionName;
				socket.emit('token', this.token);
				console.log(`Issued token(${this.token}) to ${this.streamerOwner}`);
			}
		});

		//Create session name
		let dupNameList = [];
		for (let [key, val] of this.participantSocketsFromSessionName) {
			socket.emit('createUser', key, val.userData.avatarPath, val.userData.enableSyncVRHand);
			socket.emit('userPose', { sessionName: key, pose: val.userData.pose });
			let token = key.lastIndexOf('_');
			if (key.substring(0, token) === name) {
				dupNameList.push(parseInt(key.substring(token + 1)));
			}
		}
		dupNameList.sort((a, b) => { return a - b; });
		let sessionNumber = 0;
		for (sessionNumber = 0; sessionNumber < dupNameList.length; ++sessionNumber) {
			if (dupNameList[sessionNumber] !== sessionNumber) {
				break;
			}
		}
		let sessionName = name + '_' + sessionNumber;

		//Synchronize changes to date
		for (let work of this.workHistory) {
			socket.emit('broadcasting', work.elId, work.typeNo, work.data);
		}
		for (let [key, val] of this.participantSocketsFromSessionName) {
			socket.emit('userPose', { sessionName: key, pose: val.userData.pose });
			if (val.userData.mode != 0) {
				socket.emit('userInteractionMode', { sessionName: key, mode: val.userData.mode });
				if (val.userData.mode === 1 && val.userData.enableSyncVRHand) {
					if (val.userData.vrHandPose)
						socket.emit('userHandPose', { sessionName: key, vrHandPose: val.userData.vrHandPose });
					if (val.userData.vrHandGesture[0] !== 0)
						socket.emit('userHandGesture', 0, val.userData.vrHandGesture[0]);
					if (val.userData.vrHandGesture[1] !== 0)
						socket.emit('userHandGesture', 1, val.userData.vrHandGesture[1]);
				}
			}
		}

		//Notification of new users to existing users
		socket.userData = { sessionName: sessionName, pose: { pos: [0.0, 0.0, 0.0], rot: [0.0, 0.0, 0.0] }, avatarPath: avatarPath, canWrite: false, mode: 0, enableSyncVRHand: enableSyncVRHand, vrHandPose: null, vrHandGesture: [0, 0] };
		this.participantSocketsFromSessionName.set(sessionName, socket);
		socket.join(this.wid);
		socket.to(this.wid).emit('createUser', sessionName, avatarPath, enableSyncVRHand);

		//AR Streaming reception that existed
		if (this.streamerSocket) {
			this.streamerSocket.emit('needToConn', sessionName);
		}
		socket.emit('sessionJoined', sessionName, enableSyncVRHand);

		//Check the new user has write auth
		let conn, res1;
		try {
			conn = await dbPool.getConnection();
			res1 = await conn.query('select aid from t_auth_role_relation where rid = (select rid from t_participation where uid = ? and wid = ?)', [socket.handshake.session.uid, this.wid]);
		} catch (err) {
			console.log(`err in WSSession: ${err}`);
			return;
		}
		if (conn) {
			conn.release();
		}

		if (res1.some(record => record.aid === 5)) {
			socket.userData.canWrite = true;
		}

	}

	//Join as dummy user for AR Streaming
	joinAsStreamer(socket, token) {
		if (this.token !== token)
			return false;
		this.streamerSocket = socket;
		socket.on('offer', (target, sdp) => {
			let receiverSocket = this.participantSocketsFromSessionName.get(target);
			if (receiverSocket) {
				receiverSocket.emit('ArStreamOffer', { type: 'offer', sdp: sdp });
			}
		});
		socket.on('newIceCandidate', (target, sdpMid, sdpMLineIndex, candidate) => {
			let receiverSocket = this.participantSocketsFromSessionName.get(target);
			if (receiverSocket) {
				receiverSocket.emit('ArStreamNewIceCandidate', { sdpMid: sdpMid, sdpMLineIndex: sdpMLineIndex, candidate: candidate });
			}
		});
		for (let [key, val] of this.participantSocketsFromSessionName) {
			if (this.streamerOwner !== key)
				socket.emit('needToConn', key);
		}
		return true;
	}

	leave(socket) {
		if (this.streamerSocket && this.streamerSocket.id === socket.id) {
			this.streamerSocket = null;
			this.streamerOwner = null;
			this.token = null;
			socket.to(this.wid).emit('ArStreamExpire');
		}
		else {
			io.to(this.wid).emit('removeUser', socket.userData.sessionName);
			if (this.streamerSocket && this.streamerOwner !== socket.userData.sessionName) {
				this.streamerSocket.emit('removeUser', socket.userData.sessionName);
			}
			this.participantSocketsFromSessionName.delete(socket.userData.sessionName);
		}
	}

	getPartNum() {
		return this.participantSocketsFromSessionName.size;
	}
};


// global variable of this module.
var io;
class SessionManager {

	// Initialize this instance with io.
	init(_io) {
		io = _io;

		const getWSSessionByWID = new Map(); // {key : wid, value : WSSession}

		this.isLiveSession = (wid) => {

			if (getWSSessionByWID.get(wid)) {
				return true;
			}

			return false;
		};

		this.onSaved = (uid, wid) => {

			const sess = getWSSessionByWID.get(wid);
			if (sess) {
				sess.onSaved();
			}
		};

		io.on('connection', async (socket) => {

			const uid = socket.handshake.session.uid;
			if (!uid) {
				socket.disconnect(true);
				return;
			}

			let conn, res1;
			try {
				conn = await dbPool.getConnection();
				res1 = await conn.query(`select t_user.name as name, model_path as avatarPath, vr_hand_sync as vrHandSync from t_user join t_avatar on t_user.avatar_id = t_avatar.id where t_user.id = ?`, uid);
			} catch (err) {
				console.log(err);
				return;
			}
			if (conn) {
				conn.release();
			}

			let wsSession = null;
			const { name, avatarPath, vrHandSync } = res1[0];
			const enableSyncVRHand = (vrHandSync == 1);
			console.log(`Socket connected : ${name}`);

			socket.on('joinWS', async (wid) => {
				// socket.userData.wsSession = getWSSessionByWID.get(wid);
				wsSession = getWSSessionByWID.get(wid);
				if (!wsSession) {
					wsSession = new WSSession('' + wid);
					getWSSessionByWID.set(wid, wsSession);
				}
				await wsSession.join(socket, name, avatarPath, enableSyncVRHand);
			});

			socket.on('joinWSasStreamer', (wid, token) => {
				// socket.userData.wsSession = getWSSessionByWID.get(wid);
				wsSession = getWSSessionByWID.get(wid);
				// name = token;    // ???????????? 뭐임??
				if (!wsSession || !wsSession.joinAsStreamer(socket, token)) {
					socket.disconnect(true);
					wsSession = null;
				}
			});

			socket.on('disconnect', () => {
				console.log(`socket disconnected : ${name}`);
				if (wsSession) {
					console.log(`Leave ${name} from ${wsSession.wid}`);
					wsSession.leave(socket);
					if (wsSession.getPartNum() === 0) {
						getWSSessionByWID.delete(parseInt(wsSession.wid));
						wsSession = null;
					}
				}
			});

		});

		return this;
	}
};

exports.sessionManager = new SessionManager();