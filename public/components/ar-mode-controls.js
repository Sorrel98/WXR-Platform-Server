/**
 * The class that ar-mode-controls has as a member.
 * The active marker or camera model matrix passed from the native module is applied to the scene.
 */
class ARTracker {
	constructor(arModeComp) {
		this.arModeComp = arModeComp;
		//It collects and processes the matrices sent from one frame.
		this.arFrame = null; // Map <key: frameNumber, value:{isFullSession:bool, targetList:{key:url, matrix:mat}[]}>
		this.activeMarkers = new Map(); // <key: url, value: activeMarkerComponent>
		this.lastRenderArFrameNumber;
		this.lastRenderArFrame = null;
		this.ready = false;
		this.bindedGeometryMap = new Map();
		this.defaultVisible = new Map(); // Map <key: uuid, value: visible>
	}

	setCameraProjection(near, far, fov, aspect) {
		let sceneCam = this.arModeComp.el.camera;
		sceneCam.near = near;
		sceneCam.far = far;
		sceneCam.fov = fov;
		sceneCam.aspect = aspect;
		sceneCam.updateProjectionMatrix();
	}

	forwardMatrix(frameNumber, targetCnt, targetURL, mat) { //mat : model matrix(world coordinate system)
		if (this.ready === false) return;
		let frm = this.arFrame.get(frameNumber);
		if (frameNumber < this.lastRenderArFrameNumber) {
			if (frm) {
				this.arFrame.delete(frameNumber);
			}
			return;
		}
		if (!frm) {
			frm = { isFullSession: false, targetList: [] };
			this.arFrame.set(frameNumber, frm);
		}
		frm.targetList.push({ key: targetURL, matrix: mat });
		if (targetURL === 'cameraMatrix')
			frm.isFullSession = true;

		if (frm.targetList.length === targetCnt + 1) {
			let interactionManagerComp = this.arModeComp.el.components['interaction-manager'];
			if (frm.isFullSession) { //read & write
				for (let target of frm.targetList) {
					if (target.key === 'cameraMatrix') {
						let cam = this.arModeComp.el.camera.parent;
						(new THREE.Matrix4()).fromArray(target.matrix).decompose(cam.position, cam.quaternion, cam.scale);
						cam.updateMatrix();
					}
					else {
						let am = this.activeMarkers.get(target.key);
						let targetObject = am.el.object3D;

						if (am.orgMatrix === null) {
							am.orgMatrix = am.el.object3D.matrix.clone();
						}
						am.updatedOnLastFrame = true;

						let localMat = (new THREE.Matrix4()).copy(targetObject.parent.matrixWorld).invert();
						let rhs = (new THREE.Matrix4()).fromArray(target.matrix);
						localMat.multiply(rhs);
						localMat.decompose(targetObject.position, targetObject.quaternion, targetObject.scale);
						targetObject.updateMatrix();
						am.el.emit('transformChanged');
						if (interactionManagerComp) {
							interactionManagerComp.writeInteraction(am.el, 'transform', 'total');
						}
					}
				}
				this.setVisible(true);
			}
			else {//halfSession(readonly), just move the camera
				if (frm.targetList.length === 1) {
					this.setVisible(false);
				}
				else {
					let criteria = null;
					for (let target of frm.targetList) {
						if (target.key !== 'cameraMiss')
							criteria = target;
					}
					let targetAMC = this.activeMarkers.get(criteria.key);
					let newCameraModel = targetAMC.el.object3D.matrixWorld.clone();
					newCameraModel.multiply((new THREE.Matrix4()).copy((new THREE.Matrix4()).fromArray(criteria.matrix)).invert());
					let cam = this.arModeComp.el.camera.parent;
					newCameraModel.decompose(cam.position, cam.quaternion, cam.scale);
					cam.updateMatrix();
					this.setVisible(true);
				}
			}

			if (this.lastRenderArFrame && this.lastRenderArFrame.isFullSession) {
				for (let item of this.lastRenderArFrame.targetList) {
					if (item.key === 'cameraMatrix') continue;
					let am = this.activeMarkers.get(item.key);
					am.el.object3D.visible = true;
					if (!am.updatedOnLastFrame) {
						if (interactionManagerComp)
							interactionManagerComp.writeInteraction(am.el, 'component', 'transform', am.orgMatrix);
						am.orgMatrix = null;
					}
				}
			}

			this.lastRenderArFrame = this.arFrame.get(frameNumber);
			if (this.lastRenderArFrame.isFullSession) {
				for (let item of this.lastRenderArFrame.targetList) {
					if (item.key === 'cameraMatrix') continue;
					let am = this.activeMarkers.get(item.key);
					am.el.object3D.visible = false;
					am.updatedOnLastFrame = false;
				}
			}
			this.arFrame.delete(frameNumber);
			this.lastRenderArFrameNumber = frameNumber;
		}
	}

	setVisible(val, involveSky) {
		let sceneEl = this.arModeComp.el;

		let dfs = (el, val) => {
			if (involveSky || el.tagName !== 'A-SKY') {
				let uuid = el.object3D.uuid;
				let visible = this.defaultVisible.get(uuid);
				visible = (visible === undefined ? true : visible) && val;
				el.setAttribute('visible', visible);
			}
			for (let child of el.children) {
				if (child.components)
					dfs(child, val);
			}
		};

		for (let child of sceneEl.children) {
			if (child.components) {
				dfs(child, val);
			}
		}
	}

	pushActiveMarker(amComp) {
		this.activeMarkers.set(amComp.data.src, amComp);
		this.arModeComp.callNative('loadTarget', amComp.data.src, false);
	}

	popActiveMarker(oldSrc) {
		this.activeMarkers.delete(oldSrc);
		this.arModeComp.callNative('unloadTarget', oldSrc);
	}

	pushBaseMarker(src) {
		this.arModeComp.callNative('loadTarget', src, true);
	}

	popBaseMarker(oldSrc) {
		this.arModeComp.callNative('unloadTarget', oldSrc);
	}

	pushBindedObject(markerSrc, object3D) {
		let findGeometry = (obj) => {
			if (obj.geometry) {
				let key = obj.uuid;
				this.bindedGeometryMap.set(key, obj);
				this.arModeComp.callNative('loadBindedGeometry',
					markerSrc,
					key,
					obj.geometry.attributes.position.array,
					obj.geometry.index.array);
			}
			for (let child of obj.children) {
				findGeometry(child);
			}
		};
		findGeometry(object3D);
	}

	makeDefaultVisibility() {
		let sceneEl = this.arModeComp.el;
		let dfs = (el) => {
			let uuid = el.object3D.uuid;
			let visible = el.getAttribute('visible');
			this.defaultVisible.set(uuid, visible);
			for (let child of el.children) {
				if (child.components)
					dfs(child);
			}
		};
		for (let child of sceneEl.children) {
			if (child.components) {
				dfs(child);
			}
		}
	}
};

/**
 * This component supports AR interaction through communicate with native ar module.
 * 
 */
AFRAME.registerComponent('ar-mode-controls', {
	dependencies: ['interaction-manager'],

	init: function () {
		if (this.el !== this.el.sceneEl) return;
		let sceneEl = this.el;
		this.callNative = (funcName, ...args) => { };	// On a desktop, this function do no actions.
		if (window.webkit) {	// for iOS
			this.callNative = (funcName, ...args) => {
				argv = {}
				for (let key in args) {
					argv['arg' + (key * 1 + 1)] = args[key];
				}
				console.log(argv);
				window.webkit.messageHandlers[funcName].postMessage(argv);
			};
		}
		else if (window.androidFunction) {	//for android
			this.callNative = (funcName, ...args) => {
				window.androidFunction[funcName](...args);
			};
		}
		this.ARTracker = new ARTracker(this);

		this.streamingToken = null;

		this.streamingUILayer = document.createElement('div');
		this.streamingUILayer.style.position = 'absolute';
		this.streamingUILayer.style.zIndex = 10000;
		this.streamingUILayer.style.left = '10px';
		this.streamingUILayer.style.bottom = '10px';
		this.streamingUILayer.style.display = 'none';
		document.body.appendChild(this.streamingUILayer);

		/**
		 * Environment (point cloud or scene geometry) streaming thorugh WebRTC.
		 * In one workspace session, streaming rights are exclusive 
		 * and only users who have been issued a token from the server can stream.
		 * When the streaming ends, the token is returned to the server.
		 */
		this.envGeoStreamingStatus = false;
		this.envGeoStreamingButton = document.createElement('button');
		this.envGeoStreamingButton.innerHTML = 'share env';
		this.envGeoStreamingButton.style.width = '100px';
		this.envGeoStreamingButton.style.height = '50px';
		this.envGeoStreamingButton.style.left = '5px';
		this.envGeoStreamingButton.style.bottom = '5px';
		this.envGeoStreamingButton.style.position = 'relative';
		this.envGeoStreamingButton.onclick = () => {
			if (this.envGeoStreamingStatus) {
				this.envGeoStreamingStatus = false;
				this.envGeoStreamingButton.innerHTML = 'share env';
				this.callNative('onRemoveStreamingChannel', 1);
			}
			else {
				if (this.streamingToken !== null) {
					this.envGeoStreamingStatus = true;
					this.envGeoStreamingButton.innerHTML = 'unshare env';
					this.callNative('onAddStreamingChannel', 1);
				}
				else {
					let syncComp = this.el.components['sync'];
					if (syncComp) {
						syncComp.getArStreamingToken().then((token) => {
							this.streamingToken = token;
							this.envGeoStreamingStatus = true;
							this.envGeoStreamingButton.innerHTML = 'unshare env';
							this.callNative('onInitStreaming', wid, token);
							this.callNative('onAddStreamingChannel', 1);
						})
							.catch(() => {
								console.log('token is unavailable');
							});
					}
				}
			}
		};
		this.streamingUILayer.appendChild(this.envGeoStreamingButton);

		/**
		 * Screen sharing thorugh WebRTC.
		 * In one workspace session, streaming rights are exclusive 
		 * and only users who have been issued a token from the server can stream.
		 * When the streaming ends, the token is returned to the server.
		 */
		this.videoStreamingStatus = false;
		this.videoStreamingButton = document.createElement('button');
		this.videoStreamingButton.innerHTML = 'share screen';
		this.videoStreamingButton.style = width = '100px';
		this.videoStreamingButton.style.height = '50px';
		this.videoStreamingButton.style.left = '15px';
		this.videoStreamingButton.style.bottom = '5px';
		this.videoStreamingButton.style.position = 'relative';
		this.videoStreamingButton.onclick = () => {
			if (this.videoStreamingStatus) {
				this.videoStreamingStatus = false;
				this.videoStreamingButton.innerHTML = 'share screen';
				this.callNative('onRemoveStreamingChannel', 2);
			}
			else {
				if (this.streamingToken !== null) {
					this.videoStreamingStatus = true;
					this.videoStreamingButton.innerHTML = 'unshare screen';
					this.callNative('onAddStreamingChannel', 2);
				}
				else {
					let syncComp = this.el.components['sync'];
					if (syncComp) {
						syncComp.getArStreamingToken().then((token) => {
							this.streamingToken = token;
							this.videoStreamingStatus = true;
							this.videoStreamingButton.innerHTML = 'unshare screen';
							this.callNative('onInitStreaming', wid, token);
							this.callNative('onAddStreamingChannel', 2);
						})
							.catch(() => {
								console.log('token is unavailable');
							});
					}
				}
			}
		};
		this.streamingUILayer.appendChild(this.videoStreamingButton);

		/**
		 * 360video sharing thorugh WebRTC.
		 * In one workspace session, streaming rights are exclusive 
		 * and only users who have been issued a token from the server can stream.
		 * When the streaming ends, the token is returned to the server.
		 */
		this.video360StreamingStatus = false;
		this.video360StreamingButton = document.createElement('button');
		this.video360StreamingButton.innerHTML = 'share 360 Video';
		this.video360StreamingButton.style = width = '100px';
		this.video360StreamingButton.style.height = '50px';
		this.video360StreamingButton.style.left = '15px';
		this.video360StreamingButton.style.bottom = '5px';
		this.video360StreamingButton.style.position = 'relative';
		this.video360StreamingButton.onclick = () => {
			if (this.video360StreamingStatus) {
				this.video360StreamingStatus = false;
				this.video360StreamingButton.innerHTML = 'share 360Video';
				this.callNative('onRemoveStreamingChannel', 3);
			}
			else {
				if (this.streamingToken !== null) {
					this.video360StreamingStatus = true;
					this.video360StreamingButton.innerHTML = 'unshare 360Video';
					this.callNative('onAddStreamingChannel', 3);
				}
				else {
					let syncComp = this.el.components['sync'];
					if (syncComp) {
						syncComp.getArStreamingToken().then((token) => {
							this.streamingToken = token;
							this.video360StreamingStatus = true;
							this.video360StreamingButton.innerHTML = 'unshare 360Video';
							this.callNative('onInitStreaming', wid, token);
							this.callNative('onAddStreamingChannel', 3);
						})
							.catch(() => {
								console.log('token is unavailable');
							});
					}
				}
			}
		};
		this.streamingUILayer.appendChild(this.video360StreamingButton);

		/**
		 * It is asynchronous function.
		 * It return a promise to be resolved when interaction mode change to AR.
		 */
		sceneEl._enterAR = () => {
			if (sceneEl.is('ar-mode'))
				return Promise.resolve('Already in AR.');
			const _enterAR = () => {
				if (sceneEl.isMobile) {
					this.orgCamMatrix = sceneEl.camera.parent.matrix.clone();
					this.orgCamNear = sceneEl.camera.near;
					this.orgCamFar = sceneEl.camera.far;
					this.orgCamFov = sceneEl.camera.fov;
					this.orgCamAspect = sceneEl.camera.aspect;

					sceneEl.camera.el.setAttribute('look-controls', 'enabled', false);
					sceneEl.addState('ar-mode');
					sceneEl.emit('enter-ar', { target: sceneEl });
					this.ARTracker.makeDefaultVisibility();
					this.ARTracker.setVisible(false, true);
					this.ARTracker.arFrame = new Map();
					this.ARTracker.lastRenderArFrame = null;
					this.ARTracker.lastRenderArFrameNumber = -1;
					this.ARTracker.ready = true;
					this.envGeoStreamingButton.innerHTML = 'share env';
					this.envGeoStreamingStatus = false;
					this.videoStreamingButton.innerHTML = 'share screen';
					this.videoStreamingStatus = false;
					this.streamingUILayer.style.display = 'block';

					let resultMap1 = new Map();
					let amArray = Array.from(this.ARTracker.activeMarkers);
					let findTargetingObj = (el) => {
						if (!el.id) return;
						let targetComp = el.components['target'];
						if (targetComp) {
							let markerId = targetComp.data.marker.substr(1);
							let src, markerComp;
							[url, markerComp] = amArray.find(entry => entry[1].el.id == markerId);
							if (markerComp) {
								resultMap1.set(el.id, { markerURL: url, object3D: el.object3D });
							}
						}
						for (let child of el.children) {
							findTargetingObj(child);
						}
					};
					findTargetingObj(sceneEl);
					for ([key, val] of resultMap1) {
						this.ARTracker.pushBindedObject(val.markerURL, val.object3D);
					}

					let resultMap2 = new Map();
					let findBindingObj = (el) => {
						if (!el.id) return;
						let binderComp = el.components['binder'];
						if (binderComp) {
							let targetingItem = resultMap1.get(binderComp.data.reference.substr(1));
							if (targetingItem) {
								resultMap2.set(el.id, { marker: targetingItem.markerURL, object3D: el.object3D });
							}
						}
						for (let child of el.children) {
							findBindingObj(child);
						}
					};
					findBindingObj(sceneEl);
					for ([key, val] of resultMap2) {
						this.ARTracker.pushBindedObject(val.markerURL, val.object3D);
					}

					this.callNative('onEnterAR');
				}
				else {
					console.log("Mobile only");
				}
			};
			if (sceneEl.is('vr-mode')) {
				sceneEl.exitVR().then(_enterAR);
				return Promise.resolve();
			}
			else {
				_enterAR();
				return Promise.resolve();
			}
		};

		/**
		 * It is asynchronous function.
		 * It return a promise to be resolved when interaction mode change to 3D or VR.
		 */
		sceneEl.exitAR = () => {
			if (!sceneEl.is('ar-mode'))
				return Promise.resolve('Not in AR.');
			if (this.ARTracker.lastRenderArFrame && this.ARTracker.lastRenderArFrame.isFullSession) {
				let interactionManagerComp = this.el.components['interaction-manager'];
				for (let item of this.ARTracker.lastRenderArFrame.targetList) {
					if (item.key === 'cameraMatrix') continue;
					let am = this.ARTracker.activeMarkers.get(item.key);
					am.el.object3D.visible = true;
					if (!am.updatedOnLastFrame) {
						if (interactionManagerComp)
							interactionManagerComp.writeInteraction(am.el, 'component', 'transform', am.orgMatrix);
						am.orgMatrix = null;
					}
				}
			}
			this.streamingToken = null;
			this.ARTracker.setVisible(true, true);
			this.ARTracker.bindedGeometryMap.clear();
			this.ARTracker.arFrame.clear();
			this.ARTracker.lastRenderArFrame = null;
			this.ARTracker.lastRenderArFrameNumber = -1;
			this.ARTracker.ready = false;
			sceneEl.camera.fov = this.orgCamFov;
			this.orgCamFov = null;
			sceneEl.camera.near = this.orgCamNear;
			this.orgCamNear = null;
			sceneEl.camera.far = this.orgCamFar;
			this.orgCamFar = null;
			sceneEl.camera.aspect = this.orgCamAspect;
			let cam = sceneEl.camera.parent;
			this.orgCamMatrix.decompose(cam.position, cam.quaternion, cam.scale);
			cam.updateMatrix();
			sceneEl.camera.el.setAttribute('look-controls', 'enabled', true);
			this.orgCamMatrix = null;
			this.streamingUILayer.style.display = 'none';
			this.callNative('onExitAR');
			sceneEl.removeState('ar-mode');
			sceneEl.emit('exit-ar', { target: sceneEl });
			return Promise.resolve();
		};

		this.callNative('onEnterWorkspace');
	},
	update: function (oldData) {
	},
	play: function () {
	},
	pause: function () {
	},
	tick: function () {
	},
	remove: function () {
		this.ARTracker = null;
		this.callNative = null;
		this.el.exitAR = null;
		this.el.enterAR = null;
	}
});
