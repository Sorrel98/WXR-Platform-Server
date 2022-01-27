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
			if (involveSky || el.tagName !== 'A-SKY')
				el.setAttribute('visible', val);
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
		this.callNative = (funcName, arg1, arg2) => {
		};
		if (window.webkit) { //for iOS
			this.callNative = (funcName, arg1, arg2) => {
				window.webkit.messageHandlers[funcName].postMessage({ arg1, arg2 });
			};
		}
		else if (window.androidFunction) { //for android
			this.callNative = (funcName, arg1, arg2) => {
				if (arg1 !== undefined) {
					if (arg2 !== undefined) {
						window.androidFunction[funcName](arg1, arg2);
					}
					else {
						window.androidFunction[funcName](arg1);
					}
				}
				else {
					window.androidFunction[funcName]();
				}
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
					this.ARTracker.setVisible(false, true);
					this.ARTracker.arFrame = new Map();
					this.ARTracker.lastRenderArFrame = null;
					this.ARTracker.lastRenderArFrameNumber = -1;
					this.ARTracker.ready = true;
					this.videoStreamingButton.innerHTML = 'share screen';
					this.videoStreamingStatus = false;
					this.streamingUILayer.style.display = 'block';
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
