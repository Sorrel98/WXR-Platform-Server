function uuidv4() {
	return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
		(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
	);
}

/**
 * Settings For WebRTC
 * Use the public stun and turn servers or build and use a separate stun and turn server.
 */
var iceServersConfig = {
	iceServers: [
		{
			urls: "stun:stun.l.google.com:19302"
		},
		{
			urls: "turn:numb.viagenie.ca",
			username: "webrtc@live.com",
			credential: "muazkh"
		}
	]
};

class EnvPoints {
	constructor(parent) {
		this.maxNumber = 20_000_000;
		this.pointCount = 0;
		this.nextPointIdx = 0;

		this.mesh = new THREE.Points();
		this.mesh.frustumCulled = false; // 포인트메쉬의 프러스텀컬링에 버그가 있어서 끔
		this.mesh.material.vertexColors = THREE.VertexColors;
		this.mesh.material.color.setRGB(1, 1, 1);
		this.mesh.material.size = 0.01;
		this.geometry = this.mesh.geometry;
		this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(this.maxNumber * 3), 3).setUsage(THREE.DynamicDrawUsage));
		this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(this.maxNumber * 3), 3).setUsage(THREE.DynamicDrawUsage));
		this.geometry.setDrawRange(0, this.pointCount);

		this.positions = this.geometry.attributes.position.array;
		this.colors = this.geometry.attributes.color.array;

		parent.add(this.mesh);
	}
	addPoint(x, y, z, r, g, b) {
		this.positions[3 * this.nextPointIdx] = x;
		this.positions[3 * this.nextPointIdx + 1] = y;
		this.positions[3 * this.nextPointIdx + 2] = z;
		this.colors[3 * this.nextPointIdx] = r;
		this.colors[3 * this.nextPointIdx + 1] = g;
		this.colors[3 * this.nextPointIdx + 2] = b;
		if (++this.nextPointIdx === this.maxNumber)
			this.nextPointIdx = 0;
		if (++this.pointCount > this.maxNumber)
			this.pointCount = this.maxNumber;
		this.geometry.attributes.position.needsUpdate = true;
		this.geometry.attributes.color.needsUpdate = true;
		this.geometry.setDrawRange(0, this.pointCount);
	}
	getPointCount() {
		return this.pointCount;
	}
	destroy() {
		this.mesh.parent.remove(this.mesh);
		this.mesh = null;
	}
};

/**
 * This component synchronizes work in the workspace session with WebSocket communication with the server.
 * It also supports voice chat between session participants.
 */
AFRAME.registerComponent('sync', {
	createVideosphere: function () {
		this.video360 = document.createElement('a-videosphere');
		this.video360.setAttribute('side', 'double');
		this.video360.setAttribute('src', '');
		this.el.appendChild(this.video360);
	},

	destroyVideosphere: function () {
		this.el.removeChild(this.video360);
		this.video360.destroy();
	},

	init: function () {
		if (this.el.sceneEl !== this.el) return;
		this.el.syncReady = false;
		this.lastCameraMat = null;
		this.sessionName = null;
		this.needToSyncVRHand = false;
		this.socket = null;
		this.receivedArStreamPC = null;
		this.localVoiceTrack = null;
		this.movingObjMats = new Map(); // <key: elId, value: matrix>
		this.userMap = new Map();
		this.attachReceiver = this.attachReceiver.bind(this);

		this.video360 = null

		// 360 비디오 트랙 MediaStreamTrack를 받을 변수 (위의 커스텀 프로퍼티 대신 만듦)
		// this.envSphericalTrack = null

		/**
		 * Create UI buttons related to WebRTC communication
		 */
		let rtcDiv = document.createElement('div');
		rtcDiv.style.position = 'absolute';
		rtcDiv.style.display = 'block';
		rtcDiv.style.left = '10px';
		rtcDiv.style.top = '10px';
		this.el.appendChild(rtcDiv);

		this.receivedVideoEl = document.createElement('video');
		this.receivedVideoEl.id = 'castedArScreen';
		this.receivedVideoEl.style.display = 'none';
		this.receivedVideoEl.style.width = '320px';
		this.receivedVideoEl.style.height = '180px';
		this.receivedVideoEl.style.marginBottom = '5px';
		this.receivedVideoEl.style.backgroundColor = 'black';
		this.receivedVideoEl.srcObject = new MediaStream();
		this.receivedVideoEl.autoplay = true;
		rtcDiv.appendChild(this.receivedVideoEl);

		this.receivedAudioEl = document.createElement('audio');
		this.receivedAudioEl.srcObject = new MediaStream();
		this.receivedAudioEl.hidden = true;
		this.receivedAudioEl.autoplay = true;
		rtcDiv.appendChild(this.receivedAudioEl);

		this.videoasset = document.createElement('video');
		this.videoasset.id = 'video';
		this.videoasset.setAttribute('autoplay', true);
		this.videoasset.setAttribute('controls', true);
		this.videoasset.srcObject = new MediaStream();
		this.el.appendChild(this.videoasset);

		let rtcButtonCss = `
		margin-right: 5px;
		width: 80px;
		height: 40px;
		vertical-align: top;
		`

		this.voiceButton = document.createElement('button');
		this.voiceButton.style.cssText = rtcButtonCss;
		this.voiceButton.innerHTML = 'voice on';
		this.voiceButton.disabled = true;
		this.voiceButton.onclick = () => {
			if (!this.localVoiceTrack)
				return;
			if (!this.localVoiceTrack.enabled) {
				this.localVoiceTrack.enabled = true;
				this.voiceButton.innerHTML = 'voice off';
			} else {
				this.localVoiceTrack.enabled = false;
				this.voiceButton.innerHTML = 'voice on';
			}
		}
		rtcDiv.appendChild(this.voiceButton);

		this.videoReceiving = false;
		this.videoReceiveButton = document.createElement('button');
		this.videoReceiveButton.style.cssText = rtcButtonCss;
		this.videoReceiveButton.innerHTML = 'video receive';
		this.videoReceiveButton.onclick = () => {
			if (!this.videoReceiving) {
				this.videoReceiving = true;
				if (this.receivedArStreamPC && this.receivedArStreamPC.videoTrack) {
					this.receivedArStreamPC.videoTrack.enabled = true;
				}
				this.receivedVideoEl.style.display = 'block';
				this.videoReceiveButton.innerHTML = 'stop receiving';
			} else {
				this.videoReceiving = false;
				if (this.receivedArStreamPC && this.receivedArStreamPC.videoTrack) {
					this.receivedArStreamPC.videoTrack.enabled = false;
				}
				this.receivedVideoEl.style.display = 'none';
				this.videoReceiveButton.innerHTML = 'video receive';
			}
		}
		rtcDiv.appendChild(this.videoReceiveButton);

		this.video360Receiving = false;
		this.video360ReceiveButton = document.createElement('button');
		this.video360ReceiveButton.style.cssText = rtcButtonCss;
		this.video360ReceiveButton.innerHTML = '360 video receive';
		this.video360ReceiveButton.onclick = () => {
			if (!this.video360Receiving) {
				this.createVideosphere();
				this.video360.setAttribute('src', '#video');
				this.video360Receiving = true;
				if (this.receivedArStreamPC && this.receivedArStreamPC.videoTrack) {
					this.receivedArStreamPC.videoTrack.enabled = true;
				}
				this.video360ReceiveButton.innerHTML = 'stop receiving';
			} else {
				this.destroyVideosphere()
				this.video360.setAttribute('src', "");
				this.video360Receiving = false;
				if (this.receivedArStreamPC && this.receivedArStreamPC.videoTrack) {
					this.receivedArStreamPC.videoTrack.enabled = false;
				}
				this.videoReceiveButton.disabled = false;
				this.video360ReceiveButton.innerHTML = '360 video receive';
			}
		}
		rtcDiv.appendChild(this.video360ReceiveButton);

		/**
		 * Get an audio stream from the local device's microphone
		 */
		this.gatheringVoicePromise = navigator.mediaDevices.getUserMedia({ audio: true }).then((localStream) => {
			console.log('get local voice stream');
			this.localVoiceStream = localStream;
			this.localVoiceTrack = localStream.getAudioTracks()[0];
			this.localVoiceTrack.enabled = false;
			this.voiceButton.disabled = false;
		}).catch((e) => {
			switch (e.name) {
				case "NotFoundError":
					alert("Unable to open your call because no camera and/or microphone were found.");
					break;
				case "SecurityError":
				case "PermissionDeniedError":
					// Do nothing; this is the same as the user canceling the call.
					break;
				default:
					alert("Error opening your camera and/or microphone: " + e.message);
					break;
			}
		});

		if (this.el.hasLoaded) {
			this.attachReceiver();
		}
		else {
			this.el.addEventListener('loaded', this.attachReceiver);
		}
	},

	/**
	 * Implement event listeners required by WebSocket for scene synchronization and WebRTC signaling.
	 */
	attachReceiver: function () {
		this.socket = io(window.location.origin);

		/**
		 * When a newly entered user sends a voiceOffer, a webRTC connection for voice chat is created.
		 */
		this.socket.on('voiceOffer', (name, sdp) => {
			let peer = this.userMap.get(name);
			let pc = new RTCPeerConnection(iceServersConfig);
			peer.pc = pc;
			pc.onicecandidate = (event) => {
				if (event.candidate) {
					console.log('send icecandidate');
					this.socket.emit('voiceNewIceCandidate', name, event.candidate);
				}
			};
			pc.ontrack = (event) => {
				console.log('ontrack');
				if (peer.voiceTrack) {
					this.receivedAudioEl.srcObject.removeTrack(peer.voiceTrack);
				}
				peer.voiceTrack = event.track;
				this.receivedAudioEl.srcObject.addTrack(peer.voiceTrack);
			};
			pc.oniceconnectionstatechange = (event) => {

			};
			pc.onicegatheringstatechange = (event) => {

			};
			pc.onsignalingstatechange = (event) => {

			};

			let desc = new RTCSessionDescription(sdp);
			pc.setRemoteDescription(desc).then(() => {
				return pc.createAnswer();
			})
				.then((answer) => {
					console.log('set remote description');
					return pc.setLocalDescription(answer);
				})
				.then(() => {
					console.log('set local description');
					this.socket.emit('voiceAnswer', name, pc.localDescription);
				})
				.catch(() => {
					console.log('failed voice answer');
				});

			this.gatheringVoicePromise.then(() => {
				if (this.localVoiceTrack) {
					peer.rtcRtpSender = pc.addTrack(this.localVoiceTrack);
					console.log('addded voice Track to ' + name);
				}
			});
		});

		this.socket.on('voiceAnswer', (name, sdp) => {
			let pc = this.userMap.get(name).pc;
			let desc = new RTCSessionDescription(sdp);
			pc.setRemoteDescription(desc).then(() => {
				console.log('set remote description');
			})
				.catch(() => {
					console.log('fail to set remote description');
				});
		});

		this.socket.on('voiceNewIceCandidate', (name, candidate) => {
			let pc = this.userMap.get(name).pc;
			pc.addIceCandidate(new RTCIceCandidate(candidate));
			console.log('get icecandidate');
		});

		/**
		 * When another user proposes AR streaming (screen sharing), a webRTC connection is established to create a video track.
		 */
		this.socket.on('ArStreamOffer', (sdp) => {
			let pc = new RTCPeerConnection(iceServersConfig);
			this.receivedArStreamPC = pc;
			pc.onicecandidate = (event) => {
				if (event.candidate) {
					this.socket.emit('ArStreamNewIceCandidate', event.candidate);
				}
			};
			pc.onnegotiationneeded = () => {
			};
			pc.ondatachannel = (event) => {
				let channel = event.channel;
				channel.onopen = (e) => {
					console.log(channel.label + ' channel open');
					if (channel.label === "envPoints") {
						this.envPoints = new EnvPoints(this.el.object3D);
					}
					else if (channel.label === "envPointSet") {
						this.envPointSet = new EnvPoints(this.el.object3D);
					}
				};
				channel.onclose = (e) => {
					console.log(channel.label + ' strings channel close');
					if (channel.label === "envPoints") {
						this.envPoints.destroy();
						this.envPoints = null;
					}
					else if (channel.label === "envPointSet") {
						// this.envPointSet.destroy();
						// this.envPointSet = null;
					}
				};
				if (channel.label === "strings") {
					channel.onmessage = (e) => {
						console.log(e.data);
					};
				}
				else if (channel.label === "envPoints") {
					channel.onmessage = (e) => {
						let floatView = new DataView(e.data);
						let byteArray = new Uint8Array(e.data);
						let x = floatView.getFloat32(0, false);
						let y = floatView.getFloat32(4, false);
						let z = floatView.getFloat32(8, false);
						let R = byteArray[12];
						let G = byteArray[13];
						let B = byteArray[14];
						this.envPoints.addPoint(x, y, z, R / 255, G / 255, B / 255);
					};
				}
				else if (channel.label === "envPointSet") {
					channel.onmessage = (e) => {
						let addPoint = (buffer) => {
							let floatView = new DataView(buffer);
							let byteArray = new Uint8Array(buffer);
							let numOfPoint = floatView.getUint16(0, false)
							let endI = 2 + numOfPoint * 15;
							for (i = 2; i < endI; i += 15) {
								// if (Math.random() > 0.1) continue;
								let x = floatView.getFloat32(i, false);
								let y = floatView.getFloat32(i + 4, false);
								let z = floatView.getFloat32(i + 8, false);
								let R = byteArray[i + 12];
								let G = byteArray[i + 13];
								let B = byteArray[i + 14];
								this.envPointSet.addPoint(x, y, z, R / 255, G / 255, B / 255);
							}
						}
						if (e.data.constructor.name === 'Blob')
							e.data.arrayBuffer().then(buffer => addPoint(buffer));
						else
							addPoint(e.data);
					};
				}
				else if (channel.label === "envGeometry") {
					channel.onmessage = (e) => {

					};
				}
			};
			pc.ontrack = (event) => {
				this.receivedArStreamPC.videoTrack = event.track;
				// this.envSphericalTrack = this.receivedArStreamPC
				if (event.streams[0].id == 'screen_sharing') {
					this.receivedVideoEl.srcObject.addTrack(event.track);
				} else if (event.streams[0].id == 'spherial_360') {
					this.videoasset.srcObject = event.streams[0];
				}
			};
			let desc = new RTCSessionDescription(sdp);
			pc.setRemoteDescription(desc).then(() => {
				return pc.createAnswer();
			})
				.then((answer) => {
					return pc.setLocalDescription(answer);
				})
				.then(() => {
					this.socket.emit('ArStreamAnswer', pc.localDescription);
				})
				.catch(() => {
					console.log('failed arStream answer');
				});
		});

		this.socket.on('ArStreamNewIceCandidate', (candidate) => {
			this.receivedArStreamPC.addIceCandidate(new RTCIceCandidate(candidate));
		});

		this.socket.on('ArStreamExpire', () => {
			if (this.receivedArStreamPC.videoTrack) {
				this.receivedArStreamPC.videoTrack.stop();
				this.receivedVideoEl.srcObject.removeTrack(this.receivedArStreamPC.videoTrack);
				this.videoasset.srcObject.removeTrack(this.receivedArStreamPC.videoTrack);
			}
			this.receivedArStreamPC = null;
		});

		/**
		 * When you receive your session name from the server, you prepare for all communication.
		 */
		this.socket.on('sessionJoined', (sessionName, needToSyncVRHand) => {
			this.sessionName = sessionName;
			this.needToSyncVRHand = needToSyncVRHand;
			this.el.syncReady = true;
			this.el.emit('syncReady', null, false);
			console.log('get session name : ' + sessionName);

			/**
			 * Create a webRTC connection for voice chat with other users.
			 */
			for (let [name, peer] of this.userMap) {
				let pc = new RTCPeerConnection(iceServersConfig);
				peer.pc = pc;
				pc.onicecandidate = (event) => {
					if (event.candidate) {
						console.log('send icecandidate');
						this.socket.emit('voiceNewIceCandidate', name, event.candidate);
					}
				};
				pc.onnegotiationneeded = () => {
					pc.createOffer().then((offer) => {
						return pc.setLocalDescription(offer);
					})
						.then(() => {
							console.log('set local description');
							this.socket.emit('voiceOffer', name, pc.localDescription);
						})
						.catch(() => {
							console.log('failed voice offer');
						});
				};
				pc.ontrack = (event) => {
					console.log('ontrack');
					if (peer.voiceTrack) {
						this.receivedAudioEl.srcObject.removeTrack(peer.voiceTrack);
					}
					peer.voiceTrack = event.track;
					this.receivedAudioEl.srcObject.addTrack(peer.voiceTrack);
				};
				pc.oniceconnectionstatechange = (event) => {
				};
				pc.onicegatheringstatechange = (event) => {
				};
				pc.onsignalingstatechange = (event) => {
				};
				this.gatheringVoicePromise.then(() => {
					/* if(this.localVoiceTrack) {
						peer.rtcRtpSender = pc.addTrack(this.localVoiceTrack);
						console.log('addded voice Track to ' + name);
					} */
					//Temporarily use addStream because there is a bug in addTrack.
					//(addStream is deprecated, so if the bug is fixed, please fix it with the code above)
					if (this.localVoiceTrack) {
						pc.addStream(this.localVoiceStream);
						console.log('added voice stream to ' + name);
					}
				});
			}
		});

		/**
		 * Process necessary when other users enter.
		 */
		this.socket.on('createUser', (sessionName, avatarPath, syncVRHand) => {
			console.log('create user ' + sessionName);
			let el = document.createElement('a-user');
			el.setAttribute('avatar', { modelPath: avatarPath, name: sessionName, enableHand: syncVRHand });
			el.name = sessionName;
			this.el.appendChild(el);
			this.userMap.set(sessionName, el);
		});

		/**
		 * When other users leave, the necessary processing is done.
		 */
		this.socket.on('removeUser', (sessionName) => {
			let el = this.userMap.get(sessionName);
			this.userMap.delete(sessionName);
			if (el.voiceTrack) {
				this.receivedAudioEl.srcObject.removeTrack(el.voiceTrack);
			}
			this.el.removeChild(el);
			el.destroy();
		});

		/**
		 * When another user moves, that user's avatar moves in the same way.
		 */
		this.socket.on('userPose', (data) => {
			let el = this.userMap.get(data.sessionName);
			if (el) {
				let pos = el.getAttribute('position');
				let rot = el.getAttribute('rotation');
				pos.fromArray(data.pose.pos);
				el.object3D.rotation.reorder('YXZ');
				el.object3D.rotation.fromArray(data.pose.rot);
			}
		});

		/**
		 * When another user in VR mode moves the controller, the avatar's hand model moves in the same way.
		 */
		this.socket.on('userHandPose', (data) => {
			let el = this.userMap.get(data.sessionName);
			if (el) {
				let avatar = el.components['avatar'];
				avatar.setHandPose(data.vrHandPose);
			}
		});

		/**
		 * When other users in VR mode move their fingers to make a gesture, the avatar's hand model will also make the same gesture.
		 */
		this.socket.on('userHandGesture', (data) => {
			let el = this.userMap.get(data.sessionName);
			if (el) {
				let avatar = el.components['avatar'];
				avatar.setHandGesture(data.handSide, data.gesture);
			}
		});

		/**
		 * Update the interaction mode status of other users.
		 */
		this.socket.on('userInteractionMode', (data) => {
			let el = this.userMap.get(data.sessionName);
			if (el) {
				let avatar = el.components['avatar'];
				if (data.mode === 1) {
					avatar.setVisibleHandsIfExist(true);
				}
				else {
					avatar.setVisibleHandsIfExist(false);
				}
			}
		});

		/**
		 * Synchronizes all operations that change the state of the scene from other users.
		 */
		this.socket.on('broadcasting', (elId, typeNo, data) => {
			let el = null;
			switch (typeNo) {
				case 1: //create or delete an object
					if (data.valid === true) { // create an object
						el = document.querySelector('#' + elId);
						if (!el) {
							el = document.createElement(data.tagName);
							el.setAttribute('id', elId);
							if (data.tagName !== 'A-TRIGGER' && data.tagName !== 'A-FLAG') {
								el.setAttribute('visible', true);
								el.setAttribute('position', { x: 0, y: 0, z: 0 });
								el.setAttribute('rotation', { x: 0, y: 0, z: 0 });
								el.setAttribute('scale', { x: 1, y: 1, z: 1 });
							}
							let parentEl = document.querySelector('#' + data.parentId);
							if (parentEl) {
								parentEl.appendChild(el);
							}
							else {
								console.log('nonexistent parent');
							}
						}
						else {
							console.log('existenet element');
						}
					}
					else { // delete an object
						el = document.querySelector('#' + elId);
						if (el) {
							el.parentEl.removeChild(el);
							el.destroy();
						}
						else {
							console.log('nonexistent element');
						}
					}
					break;
				case 2: //component change
					el = document.querySelector('#' + elId);
					if (el) {
						if (data.valid === true) { // create or change component's property
							el.setAttribute(data.name, data.val);
						}
						else { // delete component
							el.removeAttribute(data.name);
						}
					}
					else {
						console.log('nonexistent element');
					}
					break;
				case 3: // hierachy change
					let newParent = document.querySelector('#' + data.parentId);
					el = document.querySelector('#' + elId);
					if (newParent !== null && el !== null) {
						if (el.parentEl.id !== data.parentId) {
							let tdModeControlsComp = this.el.components['thd-mode-controls'];
							if (tdModeControlsComp)
								tdModeControlsComp.hierarchyChange(el, newParent);
						}
					}
					else {
						console.log('nonexistent element or parent');
					}
					break;
				case 4: // continuously changing transforms
					el = document.querySelector('#' + elId);
					if (el) {
						let mat4 = new THREE.Matrix4();
						mat4.elements = data;
						mat4.decompose(el.object3D.position, el.object3D.quaternion, el.object3D.scale);
						if (el.onTransformChangedBySync) {
							el.object3D.updateMatrix();
							el.onTransformChangedBySync();
						}
					}
					break;
			}
		});

		/**
		 * You are notified of the result of the synchronization process for the work you sent to the server.
		 */
		this.socket.on('syncResult', (workUUID, isComplete) => {
			this.el.emit(workUUID, { result: isComplete }, false);
		});

		/**
		 * Current scene state saved by another user
		 */
		this.socket.on('saved', () => {
			console.log('content saved by anyone');
		});

		this.socket.emit('joinWS', wid);
	},

	play: function () {

	},

	/**
	 * The camera's pose or the transform of a continuously changing object is transmitted to the server.
	 */
	tick: function () {
		if (!this.el.syncReady) return;
		let newMat = this.el.camera.matrixWorld;
		if (this.lastCameraMat == null || !newMat.equals(this.lastCameraMat)) {
			let pos = new THREE.Vector3();
			let quat = new THREE.Quaternion();
			let scl = new THREE.Vector3();
			newMat.decompose(pos, quat, scl);
			let euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
			this.socket.emit('moving', { pos: [pos.x, pos.y, pos.z], rot: [euler.x, euler.y, euler.z] });
			this.lastCameraMat = newMat.clone();
		}
		for (let [elId, matrix] of this.movingObjMats) {
			this.socket.emit('changingTfm', elId, matrix.elements);
		}
		this.movingObjMats.clear();
	},

	pause: function () {

	},

	remove: function () {
	},

	/**
	 * Stringify the data of components with multiple properties.
	 * The parameter is bound to [some element].components[any component name].data.
	 * @returns string
	 */
	_stringifyMultiPropComponent: function (componentData) {
		let ret = '';
		if ('' + componentData === '[object Object]') {
			for (let prop in componentData) {
				let tmp = '';
				if (componentData[prop] === undefined) continue;
				tmp += prop + ':';
				if (componentData[prop] && '' + componentData[prop] === '[object Object]') {
					for (let innerProp in componentData[prop]) {
						tmp += componentData[prop][innerProp] + ' ';
					}
				}
				else {
					tmp += componentData[prop];
				}
				tmp.trim();
				if (tmp.endsWith(':'))
					continue;
				tmp += ';';
				ret += tmp;
			}
		}
		else {
			ret = componentData;
		}
		return ret;
	},

	getHaveToSync: async function (el) {
		return new Promise((resolve, reject) => {
			if (el.hasLoaded) {

			}
			else {
				el.addEventListener('loaded', () => {
					for (let tmpEl = el; tmpEl !== tmpEl.sceneEl; tmpEl = tmpEl.parentEl) {
						if (tmpEl.id === '')
							resolve(false);
					}
					resolve(true);
				});
			}
		});
	},
	/**
	 * If live is true, object creation is sent, if false, object deletion is sent to the server.
	 * If the server rejects the synchronization process, the promise is rejected and the local work is also canceled.
	 */
	writeObject: async function (el, live) {
		return new Promise((resolve, reject) => {
			if (!canWrite)
				reject();
			else {
				let uuid = uuidv4();
				let startTime = Date.now();
				let syncResultFunc = (e) => {
					console.log(Date.now() - startTime + "ms");
					this.el.removeEventListener(uuid, syncResultFunc);
					if (e.detail.result)
						resolve();
					else
						reject();
				};

				if (el.hasLoaded) {
					for (let tmpEl = el; tmpEl !== tmpEl.sceneEl; tmpEl = tmpEl.parentEl) {
						if (tmpEl.id === '') {
							reject();
							return;
						}
					}
					this.el.addEventListener(uuid, syncResultFunc);
					if (live) {
						if (this.el.syncReady) {
							this.socket.emit('work', uuid, el.id, 1, { valid: true, parentId: el.parentEl.id, tagName: el.tagName });
						}
						else {
							this.el.addEventListener('syncReady', () => {
								this.socket.emit('work', uuid, el.id, 1, { valid: true, parentId: el.parentEl.id, tagName: el.tagName });
							});
						}
					}
					else {
						if (this.el.syncReady) {
							this.socket.emit('work', uuid, el.id, 1, { valid: false });
						}
						else {
							this.el.addEventListener('syncReady', () => {
								this.socket.emit('work', uuid, el.id, 1, { valid: false });
							});
						}
					}
				}
				else {
					el.addEventListener('loaded', () => {
						for (let tmpEl = el; tmpEl !== tmpEl.sceneEl; tmpEl = tmpEl.parentEl) {
							if (tmpEl.id === '') {
								reject();
								return;
							}
						}
						this.el.addEventListener(uuid, syncResultFunc);
						if (live) {
							if (this.el.syncReady) {
								this.socket.emit('work', uuid, el.id, 1, { valid: true, parentId: el.parentEl.id, tagName: el.tagName });
							}
							else {
								this.el.addEventListener('syncReady', () => {
									this.socket.emit('work', uuid, el.id, 1, { valid: true, parentId: el.parentEl.id, tagName: el.tagName });
								});
							}
						}
						else {
							if (this.el.syncReady) {
								this.socket.emit('work', uuid, el.id, 1, { valid: false });
							}
							else {
								this.el.addEventListener('syncReady', () => {
									this.socket.emit('work', uuid, el.id, 1, { valid: false });
								});
							}
						}
					});
				}
			}
		});
	},

	/**
	 * Sends component changes to the server.
	 * If the server rejects the synchronization process, the promise is rejected and the local work is also canceled.
	 */
	writeComponent: async function (el, componentName) {
		return new Promise((resolve, reject) => {
			if (!canWrite || el.id === '')
				reject();
			else {
				let uuid = uuidv4();
				let startTime = Date.now();
				let syncResultFunc = (e) => {
					console.log(Date.now() - startTime + "ms");
					this.el.removeEventListener(uuid, syncResultFunc);
					if (e.detail.result)
						resolve();
					else
						reject();
				};
				this.el.addEventListener(uuid, syncResultFunc);
				let value = el.getAttribute(componentName);
				if (value === null) {
					if (this.el.syncReady) {
						this.socket.emit('work', uuid, el.id, 2, { valid: false, name: componentName });
					}
					else {
						this.el.addEventListener('syncReady', () => {
							this.socket.emit('work', uuid, el.id, 2, { valid: false, name: componentName });
						});
					}
				}
				else {
					if (value === undefined)
						value = AFRAME.components[componentName].schema.default;
					if (componentName === 'position' || componentName === 'rotation' || componentName === 'scale') {
						value = AFRAME.utils.coordinates.stringify(value);
						if (this.el.syncReady) {
							let matrix = this.movingObjMats.get(el.id);
							if (matrix) {
								this.socket.emit('changingTfm', el.id, matrix.elements); //flush
								this.movingObjMats.delete(el.id);
							}
						}
					}
					else {
						const componentData = el.components[componentName].data;
						value = this._stringifyMultiPropComponent(componentData);
					}
					if (this.el.syncReady) {
						this.socket.emit('work', uuid, el.id, 2, { valid: true, name: componentName, val: value });
					}
					else {
						this.el.addEventListener('syncReady', () => {
							this.socket.emit('work', uuid, el.id, 2, { valid: true, name: componentName, val: value });
						});
					}
				}
			}
		});
	},


	/**
	 * When an object's parent changes, it is sent to the server.
	 * If the server rejects the synchronization process, the promise is rejected and the local work is also canceled.
	 */
	writeHierarchyChange: async function (el) {
		return new Promise((resolve, reject) => {
			if (!canWrite && el.id === '')
				reject();
			else {
				let uuid = uuidv4();
				let startTime = Date.now();
				let syncResultFunc = (e) => {
					console.log(Date.now() - startTime + "ms");
					this.el.removeEventListener(uuid, syncResultFunc);
					if (e.detail.result)
						resolve();
					else
						reject();
				};
				this.el.addEventListener(uuid, syncResultFunc);
				if (this.el.syncReady) {
					this.socket.emit('work', uuid, el.id, 3, { parentId: el.parentEl.id });
				}
				else {
					this.el.addEventListener('syncReady', () => {
						this.socket.emit('work', uuid, el.id, 3, { parentId: el.parentEl.id });
					});
				}
			}
		});
	},

	/**
	 * Note the continuously changing transforms.
	 * In the tick method, only the latest transform is sent to the server.
	 */
	writeTransform: function (el) {
		if (!canWrite || !this.el.syncReady)
			return;
		this.movingObjMats.set(el.id, el.object3D.matrix);
	},

	/**
	 * Request permission for AR Streaming from the server.
	 * After receiving the token from the server, it can be authenticated and streamed,
	 * and if it does not receive the token, it is rejected.
	 */
	getArStreamingToken: async function () {
		return new Promise((resolve, reject) => {
			this.socket.on('token', (token) => {
				console.log('get token');
				this.socket.off('token');
				if (token === 'unavailable') {
					reject();
				}
				else {
					this.arStreamingToken = token;
					resolve(token);
				}
			});
			this.socket.emit('requireToken');
		});
	},

	/**
	 * When the interaction mode is changed, it is sent to the server.
	 */
	writeInteractionModeChange: function (mode) {
		if (this.el.syncReady) {
			this.socket.emit('changeInteractionMode', mode);
		}
		else {
			this.el.addEventListener('syncReady', () => {
				this.socket.emit('changeInteractionMode', mode);
			});
		}
	},

	/**
	 * In VR mode, the movement of the two-handed controller is transmitted to the server.
	 */
	writeVRHandTransform: function (leftHandMatrix, rightHandMatrix) {
		if (!this.needToSyncVRHand) return;
		let leftPos = new THREE.Vector3();
		let leftQuat = new THREE.Quaternion();
		let leftScl = new THREE.Vector3();
		let rightPos = new THREE.Vector3();
		let rightQuat = new THREE.Quaternion();
		let rightScl = new THREE.Vector3();
		leftHandMatrix.decompose(leftPos, leftQuat, leftScl);
		rightHandMatrix.decompose(rightPos, rightQuat, rightScl);
		this.socket.emit('vrHandMoving', { left: { pos: leftPos.toArray(), rot: leftQuat.toArray() }, right: { pos: rightPos.toArray(), rot: rightQuat.toArray() } });
	},

	/**
	 * In VR mode, the gesture is determined according to the controller button input state and transmitted to the server.
	 */
	writeVRHandGesture: function (handSide, gesture) {
		if (!this.needToSyncVRHand) return;
		this.socket.emit('vrHandGestureChanged', handSide, gesture);
	}
});