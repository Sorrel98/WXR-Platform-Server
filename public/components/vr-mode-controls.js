/**
 * This component supports VR interaction through VR controller.
 * You can move the camera through the thumbstick.
 * By clicking on the thumbstick, you can toggle between 2D and 3D movement modes.
 * And you can transform the target object through the trigger button or grip button.
 * One-handed trigger operation is a free operation mode,
 * and the target object can be moved while ignoring movement restrictions such as vr-snap, vr-slide, and vr-1axis-hinge.
 * The basic operation is to grab an object with the grip button and move it.
 * By moving the controller in the holding state, the position and rotation of the target can be manipulated.
 * You can adjust the scale by holding the grip button on the same object with both hands.
 * And if you hold the same object with both hands trigger button, you can rotate it in place.
 */
AFRAME.registerComponent('vr-mode-controls', {
	dependencies: ['interaction-manager'],

	schema: {
		enableOneHandTrigger: { default: true }, // free operation mode
		enableTwoHandTrigger: { default: true }, // rotate in place
		enableTwoHandGrip: { default: true }, // scale in place
		floorHeight: { default: 0 }, //in 2D movement mode
		moveSpeed: { default: 2 }
	},

	makeController: function () {
		this.el.removeEventListener('enter-vr', this.makeController);
		this.el.addEventListener('exit-vr', this.destroyController);
		let rig = this.rig;

		let left = this.leftController;
		if (left === null) {
			console.log('make left controller');
			left = document.createElement('a-entity');
			this.leftController = left;
			left.setAttribute('laser-controls', 'hand', 'left');
			left.setAttribute('line', 'color: red; opacity: 0.7');
			left.setAttribute('raycaster', 'autoRefresh', false);
			left.setAttribute('raycaster', 'enabled', false);
			left.gesture = 0;
			left.topButtonDownCount = 0;
			rig.appendChild(left);
		}

		let right = this.rightController;
		if (right === null) {
			console.log('make right controller');
			right = document.createElement('a-entity');
			this.rightController = right;
			right.setAttribute('laser-controls', 'hand', 'right');
			right.setAttribute('line', 'color: red; opacity: 0.7');
			right.setAttribute('raycaster', 'autoRefresh', false);
			right.setAttribute('raycaster', 'enabled', false);
			right.gesture = 0;
			right.topButtonDownCount = 0;
			rig.appendChild(right);
		}

		left.addEventListener('triggerdown', onTriggerDown, false);
		left.addEventListener('triggerup', onTriggerUp, false);
		left.addEventListener('gripdown', onGripDown, false);
		left.addEventListener('gripup', onGripUp, false);
		left.addEventListener('xbuttondown', _xButtonDown, false);
		left.addEventListener('ybuttondown', _yButtonDown, false);
		left.addEventListener('xbuttonup', onTopButtonUp, false);
		left.addEventListener('ybuttonup', onTopButtonUp, false);
		left.addEventListener('axismove', _axisMove, false);
		left.addEventListener('thumbstickdown', _thumbStickDown, false);

		right.addEventListener('triggerdown', onTriggerDown, false);
		right.addEventListener('triggerup', onTriggerUp, false);
		right.addEventListener('gripdown', onGripDown, false);
		right.addEventListener('gripup', onGripUp, false);
		right.addEventListener('abuttondown', _aButtonDown, false);
		right.addEventListener('bbuttondown', _bButtonDown, false);
		right.addEventListener('abuttonup', onTopButtonUp, false);
		right.addEventListener('bbuttonup', onTopButtonUp, false);
		right.addEventListener('axismove', _axisMove, false);
		right.addEventListener('thumbstickdown', _thumbStickDown, false);

		/**
		 * state
		 * 0 - idle
		 * 1 - free operation(one hand trigger)
		 * 2 - normal operation(one hand grip)
		 * 3 - rotation operation(both hand trigger)
		 * 4 - scale operation(both hand grip)
		 */
		left.hand = 'left';
		left.otherHandEl = right;
		left.controls = this;
		left.targetEl = null;
		left.thumbstickdown = false;
		left.moveInput = new THREE.Vector3();
		left.state = 0;
		left.orgWorldInverse = new THREE.Matrix4();
		left.targetOrgWorld = new THREE.Matrix4();
		left.targetOrgLocal = new THREE.Matrix4();
		left.targetFromThis = new THREE.Matrix4();
		left.gesture = 0; //bitmask

		right.hand = 'right';
		right.otherHandEl = left;
		right.controls = this;
		right.targetEl = null;
		right.thumbstickdown = false;
		right.moveInput = new THREE.Vector3();
		right.state = 0;
		right.orgWorldInverse = new THREE.Matrix4();
		right.targetOrgWorld = new THREE.Matrix4();
		right.targetOrgLocal = new THREE.Matrix4();
		right.targetFromThis = new THREE.Matrix4();
		right.gesture = 0; //bitmask

		function _aButtonDown() {
			if (++this.topButtonDownCount == 1)
				writeGestureIfChanged.bind(this)(this.gesture | (1 << 2));

			this.emit('aButtonDown');
		};

		function _bButtonDown() {
			if (++this.topButtonDownCount == 1)
				writeGestureIfChanged.bind(this)(this.gesture | (1 << 2));

			this.emit('bButtonDown');
		};

		//undo
		function _xButtonDown() {
			if (++this.topButtonDownCount == 1)
				writeGestureIfChanged.bind(this)(this.gesture | (1 << 2));

			let interactionManagerComp = this.sceneEl.components['interaction-manager'];
			if (this.state === 0 && interactionManagerComp) {
				interactionManagerComp.undo();
			}
		};

		//redo
		function _yButtonDown() {
			if (++this.topButtonDownCount == 1)
				writeGestureIfChanged.bind(this)(this.gesture | (1 << 2));

			let interactionManagerComp = this.sceneEl.components['interaction-manager'];
			if (this.state === 0 && interactionManagerComp) {
				interactionManagerComp.redo();
			}
		};

		function onTopButtonUp() {
			if (--this.topButtonDownCount == 0)
				writeGestureIfChanged.bind(this)(this.gesture & ~(1 << 2));
		};

		function _axisMove(e) {
			let axisArray = e.detail.axis;
			if (axisArray.length === 4) { //for oculus quest
				for (let idx = 2; idx < 4; ++idx)
					if (Math.abs(axisArray[idx]) < 0.5)
						axisArray[idx] = 0;
				this.moveInput.set(axisArray[2], 0, axisArray[3]);
			}
			else if (axisArray.length === 2) { //for general device
				for (let idx = 0; idx < 2; ++idx)
					if (Math.abs(axisArray[idx]) < 0.5)
						axisArray[idx] = 0;
				this.moveInput.set(axisArray[0], 0, axisArray[1]);
			}
			let rayDir = this.components['raycaster'].data.direction;
			rayDir = new THREE.Vector3(rayDir.x, rayDir.y, rayDir.z).normalize();
			let Q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), rayDir);
			this.moveInput.applyQuaternion(Q.premultiply(this.object3D.quaternion));
		};

		function _thumbStickDown(e) {
			if (this.thumbstickdown) {
				this.thumbstickdown = false;
			}
			else {
				this.thumbstickdown = true;
				this.controls.move3DMode = !this.controls.move3DMode;
				console.log('toggled 2d/3d movement mode');
			}
		};

		function onGripDown(event) {
			if (this.state !== 0) return;

			writeGestureIfChanged.bind(this)(this.gesture | (1 << 1));

			let raycasterComp = this.components.raycaster;
			raycasterComp.objects = [];
			let entry = (obj, collidableAncestor) => {
				let hasCollidable = obj.hasAttribute('collidable');
				if (obj.object3DMap['mesh']) {
					if (collidableAncestor || hasCollidable) {
						raycasterComp.objects.push(obj.object3DMap['mesh']);
					}
				}
				for (let child of obj.getChildEntities()) {
					entry(child, collidableAncestor || hasCollidable);
				}
			};
			entry(this.controls.el, false);

			//Selects the object with the smallest size collider enclosing the origin of the controller.
			let minimalVol;
			for (let obj of raycasterComp.objects) {
				let dfs = (t) => {
					if (t.geometry) {
						let thisWorldPos = new THREE.Vector3();
						this.object3D.getWorldPosition(thisWorldPos);
						let controllerOrigin = t.worldToLocal(thisWorldPos);
						if (t.geometry.boundingBox) {
							if (t.geometry.boundingBox.containsPoint(controllerOrigin)) {
								let sz = new THREE.Vector3();
								t.geometry.boundingBox.getSize(sz);
								let vol = sz.x * sz.y * sz.z;
								if (!this.targetEl || minimalVol > vol) {
									this.targetEl = t.el;
									minimalVol = vol;
									return true;
								}
							}
						}
						else if (t.geometry.boundingSphere) {
							if (t.geometry.boundingSphere.containsPoint(controllerOrigin)) {
								let vol = Math.pow(t.geometry.boundingSphere.radius, 3) * Math.PI * 4 / 3;
								if (!this.targetEl || minimalVol > vol) {
									this.targetEl = t.el;
									minimalVol = vol;
									return true;
								}
							}
						}
						return false;
					}
					else {
						let ret = false;
						for (child of t.children) {
							ret |= dfs(child);
						}
						return ret;
					}
				};
				dfs(obj);
			}
			if (!this.targetEl) return;
			//Finds the closest ancestor with the collidable attribute.
			for (; this.targetEl !== this.targetEl.sceneEl; this.targetEl = this.targetEl.parentEl) {
				if (this.targetEl.hasAttribute('collidable'))
					break;
			}
			if (this.targetEl === this.targetEl.sceneEl) return;

			this.orgWorldInverse.copy(this.object3D.matrixWorld).invert();
			this.targetOrgWorld.copy(this.targetEl.object3D.matrixWorld);
			this.targetFromThis.multiplyMatrices(this.orgWorldInverse, this.targetOrgWorld);
			this.targetOrgLocal.copy(this.targetEl.object3D.matrix);

			this.state = 2;
			this.setAttribute('raycaster', 'showLine', false);

			//If you have already gripped the same object with the opposite hand, transition to the scale operation.
			if (this.otherHandEl && this.otherHandEl.state === 2 && this.otherHandEl.targetEl === this.targetEl) {
				let interactionManagerComp = this.sceneEl.components['interaction-manager'];
				if (this.controls.data.enableTwoHandGrip) {
					if (interactionManagerComp && this.targetEl !== this.controls.arScreen) {
						//In the work history, work in state 2 and work in state 4 are distinguished.
						interactionManagerComp.writeInteraction(this.targetEl, 'component', 'transform', this.otherHandEl.targetOrgLocal);
					}

					this.targetOrgLocal.copy(this.targetEl.object3D.matrix);
					this.otherHandEl.targetOrgLocal.copy(this.targetOrgLocal);
					this.targetOrgWorld.copy(this.targetEl.object3D.matrixWorld);
					this.otherHandEl.targetOrgWorld.copy(this.targetOrgWorld);
					this.state = 4;
					this.otherHandEl.state = 4;
					this.controls.scaleMode = true;

					let leftPos, rightPos;
					if (this.hand === 'left') {
						leftPos = this.object3D.position;
						rightPos = this.otherHandEl.object3D.position;
					}
					else {
						leftPos = this.otherHandEl.object3D.position;
						rightPos = this.object3D.position;
					}
					this.controls.leftToRightVec = new THREE.Vector3().subVectors(rightPos, leftPos);
				}
				else {
					if (this.otherHandEl.targetEl !== this.controls.arScreen) {
						let targetMatWorld = this.otherHandEl.targetFromThis.clone();
						targetMatWorld.premultiply(this.otherHandEl.object3D.matrixWorld);
						let targetMatLocal = (new THREE.Matrix4()).copy(this.otherHandEl.targetEl.object3D.parent.matrixWorld).invert();
						targetMatLocal.multiply(targetMatWorld);
						if (this.otherHandEl.targetEl.components['vr-slide']) {
							this.otherHandEl.targetEl.components['vr-slide'].onRelease();
						}
						for (let componentName in this.otherHandEl.targetEl.components) {
							if (componentName.startsWith('vr-snap')) {
								this.otherHandEl.targetEl.components[componentName].checkTolerance(targetMatLocal);
							}
						}
						if (interactionManagerComp) {
							interactionManagerComp.writeInteraction(this.otherHandEl.targetEl, 'component', 'transform', this.otherHandEl.targetOrgLocal);
						}
					}
					this.otherHandEl.targetEl = null;
					this.otherHandEl.state = 0;
					this.otherHandEl.setAttribute('raycaster', 'showLine', true);
					this.otherHandEl.setAttribute('line', 'color', 'red');
				}
			}
		};

		function onGripUp(event) {
			writeGestureIfChanged.bind(this)(this.gesture & ~(1 << 1));

			let interactionManagerComp = this.sceneEl.components['interaction-manager'];
			if (this.state === 2) {
				if (this.targetEl !== this.controls.arScreen) {
					let targetMatWorld = this.targetFromThis.clone();
					targetMatWorld.premultiply(this.object3D.matrixWorld);
					let targetMatLocal = (new THREE.Matrix4()).copy(this.targetEl.object3D.parent.matrixWorld).invert();
					targetMatLocal.multiply(targetMatWorld);
					if (this.targetEl.components['vr-slide']) {
						this.targetEl.components['vr-slide'].onRelease();
					}
					for (let componentName in this.targetEl.components) {
						if (componentName.startsWith('vr-snap')) {
							this.targetEl.components[componentName].checkTolerance(targetMatLocal);
						}
					}
					if (interactionManagerComp) {
						let transformed = false;
						for (let i = 0; i < 16; ++i) {
							if (this.targetOrgLocal.elements[i] !== this.targetEl.object3D.matrix.elements[i]) {
								transformed = true;
								break;
							}
						}
						if (transformed)
							interactionManagerComp.writeInteraction(this.targetEl, 'component', 'transform', this.targetOrgLocal);
					}
				}
				this.targetEl = null;
				this.state = 0;
				this.setAttribute('raycaster', 'showLine', true);
				this.setAttribute('line', 'color', 'red');
			}
			else if (this.state === 4) {
				if (interactionManagerComp && this.targetEl !== this.controls.arScreen) {
					let posOrg = new THREE.Vector3();
					let quatOrg = new THREE.Quaternion();
					let sclOrg = new THREE.Vector3();
					this.targetOrgLocal.decompose(posOrg, quatOrg, sclOrg);

					interactionManagerComp.writeInteraction(this.targetEl, 'component', 'scale', AFRAME.utils.coordinates.stringify(sclOrg));
				}
				this.controls.scaleMode = false;
				this.targetEl = null;
				this.state = 0;
				this.setAttribute('raycaster', 'showLine', true);
				this.setAttribute('line', 'color', 'red');
				if (this.otherHandEl.state === 4) {
					this.otherHandEl.targetEl = null;
					this.otherHandEl.state = 0;
					this.otherHandEl.setAttribute('raycaster', 'showLine', true);
					this.otherHandEl.setAttribute('line', 'color', 'red');
				}
			}
		};

		function onTriggerDown(event) {
			if (this.state !== 0) return;

			writeGestureIfChanged.bind(this)(this.gesture | (1 << 0));

			let raycasterComp = this.components.raycaster;
			raycasterComp.objects = [];
			let entry = (obj, collidableAncestor) => {
				let hasCollidable = obj.hasAttribute('collidable');
				if (obj.object3DMap['mesh']) {
					if (collidableAncestor || hasCollidable) {
						raycasterComp.objects.push(obj.object3DMap['mesh']);
					}
				}
				for (let child of obj.getChildEntities()) {
					entry(child, collidableAncestor || hasCollidable);
				}
			};
			entry(this.controls.el, false);
			raycasterComp.dirty = false;
			raycasterComp.checkIntersections();
			if (raycasterComp.intersectedEls.length === 0) return;
			this.targetEl = raycasterComp.intersectedEls[0];
			for (; this.targetEl !== this.targetEl.sceneEl; this.targetEl = this.targetEl.parentEl) {
				if (this.targetEl.hasAttribute('collidable'))
					break;
			}
			if (this.targetEl === this.targetEl.sceneEl) return;

			this.orgWorldInverse.getInverse(this.object3D.matrixWorld);
			this.targetOrgWorld.copy(this.targetEl.object3D.matrixWorld);
			this.targetFromThis.multiplyMatrices(this.orgWorldInverse, this.targetOrgWorld);
			this.targetOrgLocal.copy(this.targetEl.object3D.matrix);

			this.state = 1;

			//If you have already triggered the same object with the opposite hand, transition to the rotation operation.
			if (this.otherHandEl && this.otherHandEl.state === 1 && this.otherHandEl.targetEl === this.targetEl) {
				let interactionManagerComp = this.sceneEl.components['interaction-manager'];
				if (this.controls.data.enableTwoHandTrigger) {
					if (interactionManagerComp && this.targetEl !== this.controls.arScreen) {
						interactionManagerComp.writeInteraction(this.targetEl, 'component', 'transform', this.otherHandEl.targetOrgLocal);
					}

					this.targetOrgLocal.copy(this.targetEl.object3D.matrix);
					this.otherHandEl.targetOrgLocal.copy(this.targetOrgLocal);
					this.targetOrgWorld.copy(this.targetEl.object3D.matrixWorld);
					this.otherHandEl.targetOrgWorld.copy(this.targetOrgWorld);
					this.state = 3;
					this.otherHandEl.state = 3;
					this.controls.rotationMode = true;
					this.setAttribute('raycaster', 'showLine', false);
					this.otherHandEl.setAttribute('raycaster', 'showLine', false);
					let leftPos, rightPos;
					if (this.hand === 'left') {
						leftPos = this.object3D.position;
						rightPos = this.otherHandEl.object3D.position;
					}
					else {
						leftPos = this.otherHandEl.object3D.position;
						rightPos = this.object3D.position;
					}
					this.controls.leftToRightVec = new THREE.Vector3().subVectors(rightPos, leftPos);
					this.controls.leftToRightVec.normalize();
					this.controls.targetOrgQuat = this.targetEl.object3D.quaternion.clone();
				}
				else {
					if (interactionManagerComp && this.otherHandEl.targetEl !== this.controls.arScreen) {
						interactionManagerComp.writeInteraction(this.targetEl, 'component', 'transform', this.otherHandEl.targetOrgLocal);
					}
					this.otherHandEl.targetEl = null;
					this.otherHandEl.state = 0;
					this.otherHandEl.setAttribute('line', 'color', 'red');
				}
			}
		};

		function onTriggerUp(event) {
			writeGestureIfChanged.bind(this)(this.gesture & ~(1 << 0));

			let interactionManagerComp = this.sceneEl.components['interaction-manager'];
			if (this.state === 1) {
				if (interactionManagerComp && this.targetEl !== this.controls.arScreen) {
					let transformed = false;
					for (let i = 0; i < 16; ++i) {
						if (this.targetOrgLocal.elements[i] !== this.targetEl.object3D.matrix.elements[i]) {
							transformed = true;
							break;
						}
					}
					if (transformed)
						interactionManagerComp.writeInteraction(this.targetEl, 'component', 'transform', this.targetOrgLocal);
				}
				this.targetEl = null;
				this.state = 0;
				this.setAttribute('line', 'color', 'red');
			}
			else if (this.state === 3) {
				if (interactionManagerComp && this.targetEl !== this.controls.arScreen) {
					let posOrg = new THREE.Vector3();
					let quatOrg = new THREE.Quaternion();
					let sclOrg = new THREE.Vector3();
					this.targetOrgLocal.decompose(posOrg, quatOrg, sclOrg);
					let rotOrg = new THREE.Euler();
					rotOrg.setFromQuaternion(quatOrg, this.targetEl.object3D.rotation.order);

					interactionManagerComp.writeInteraction(this.targetEl, 'component', 'rotate', AFRAME.utils.coordinates.stringify(rotOrg.toVector3().multiplyScalar(180 / Math.PI)));
				}
				this.controls.rotationMode = false;
				this.targetEl = null;
				this.state = 0;
				this.setAttribute('raycaster', 'showLine', true);
				this.setAttribute('line', 'color', 'red');
				if (this.otherHandEl.state === 3) {
					this.otherHandEl.targetEl = null;
					this.otherHandEl.state = 0;
					this.otherHandEl.setAttribute('raycaster', 'showLine', true);
					this.otherHandEl.setAttribute('line', 'color', 'red');
				}
			}
		};

		function writeGestureIfChanged(newGesture) {
			if (newGesture === this.gesture) return;
			this.gesture = newGesture;
			let interactionManagerComp = this.controls.el.sceneEl.components['interaction-manager'];
			if (interactionManagerComp) {
				let handSide = this.hand === 'left' ? 0 : 1;
				interactionManagerComp.writeVRHandGesture(handSide, this.gesture);
			}
		};

		this.controllerReady = true;
	},

	destroyController: function () {
		this.el.addEventListener('enter-vr', this.makeController);
		if (this.leftController) {
			console.log('destroy left controller');
			if (this.leftController.parentEl) {
				this.leftController.parentEl.removeChild(this.leftController);
			}
			this.leftController = null;
		}
		if (this.rightController) {
			console.log('destroy right controller');
			if (this.rightController.parentEl) {
				this.rightController.parentEl.removeChild(this.rightController);
			}
			this.rightController = null;
		}
		this.rotationMode = false;
		this.scaleMode = false;
	},

	/**
	 * After activating video recevie in 3D interaction mode, ARScreen appears when entering VR interaction mode.
	 * ARScreen exists in the scene and can be transformed like any other object, but is not synchronized with other users.
	 */
	makeArScreen: function () {
		this.el.removeEventListener('enter-vr', this.makeArScreen);
		this.el.addEventListener('exit-vr', this.destroyArScreen);
		let castedArScreen = document.querySelector('#castedArScreen');
		if (castedArScreen && castedArScreen.style.display === 'block') {
			console.log("makeArScreen");
			this.arScreen = document.createElement('a-video');
			this.arScreen.setAttribute('geometry', 'width', 3.2);
			this.arScreen.setAttribute('geometry', 'height', 1.8);
			this.arScreen.setAttribute('material', 'src', '#castedArScreen');
			this.arScreen.setAttribute('collidable', '');
			this.rig.appendChild(this.arScreen);
			this.arScreen.setAttribute('position', '0 1 -1');
		}
	},

	destroyArScreen: function () {
		this.el.addEventListener('enter-vr', this.makeArScreen);
		if (this.arScreen) {
			console.log('destroyArScreen');
			this.rig.removeChild(this.arScreen);
			this.arScreen = null;
		}
	},

	makeStreamingUI: function () {
		this.el.removeEventListener('enter-vr', this.makeStreamingUI);
		this.el.addEventListener('exit-vr', this.destroyStreamingUI);
		let syncComp = this.el.sceneEl.components['sync'];
		this.video360streamingstatus = syncComp.video360streamingstatus; //correct
		console.log(this.video360streamingstatus);
		this.streamingUI.setAttribute('id', 'signal');
		this.streamingUI.setAttribute('radius','0.005');
		this.streamingUI.setAttribute('metalness','0');
		if(this.video360streamingstatus == true){
			this.streamingUI.setAttribute('color','green');
		}
		else{
			this.streamingUI.setAttribute('color','gray');
		}
		this.camera.appendChild(this.streamingUI);
		this.streamingUI.object3D.position.set(-0.07,0.07, -0.2); //좌우, 아래위, 앞뒤

	},

	destroyStreamingUI: function () {
		this.el.addEventListener('enter-vr', this.makeStreamingUI);
		if (this.streamingUI) {
			this.streamingUI.remove();
		}
	},

	init: function () {
		if (this.el !== this.el.sceneEl) return;
		this.move3DMode = true;
		this.rotationMode = false;
		this.scaleMode = false;
		this.rig = document.querySelector('[camera]').parentEl;
		this.camera = document.querySelector('[camera]')
		this.rig.controls = this;
		this.arScreen = null;
		this.leftController = null;
		this.rightController = null;
		this.makeController = this.makeController.bind(this);
		this.destroyController = this.destroyController.bind(this);
		this.makeArScreen = this.makeArScreen.bind(this);
		this.destroyArScreen = this.destroyArScreen.bind(this);
		this.streamingUI = document.createElement('a-sphere');
		this.makeStreamingUI = this.makeStreamingUI.bind(this);
		this.destroyStreamingUI = this.destroyStreamingUI.bind(this);
		this.controllerReady = false;
		this.video360streamingstatus = false;
		this.el.addEventListener('enter-vr', this.makeController);
		this.el.addEventListener('enter-vr', this.makeArScreen);
		this.el.addEventListener('enter-vr', this.makeStreamingUI);
		this.el.addEventListener('exit-vr', this.destroyArScreen);
		this.el.addEventListener('exit-vr', this.destroyStreamingUI);
	},

	tick: function () {
		// this.arUI.object3D.position.set(this.rig.object3D.position);
		if (!this.controllerReady) return;
		let interactionManagerComp = this.el.sceneEl.components['interaction-manager'];

		if (interactionManagerComp && this.leftController && this.rightController) {
			interactionManagerComp.writeVRHandTransform(
				this.leftController.object3D.matrixWorld,
				this.rightController.object3D.matrixWorld);
		}

		//Handling of manipulation of target object while holding one hand controller button
		let processController = (controller) => {
			if (!controller) return;
			if (controller.state < 1 || controller.state > 2) return;
			if (controller.state == 1 && !this.data.enableOneHandTrigger) return;
			let target = controller.targetEl;
			let targetMatWorld = controller.targetFromThis.clone();
			targetMatWorld.premultiply(controller.object3D.matrixWorld);
			let targetMatLocal = (new THREE.Matrix4()).copy(target.object3D.parent.matrixWorld).invert();
			targetMatLocal.multiply(targetMatWorld);
			let targetPos = new THREE.Vector3();
			let targetQuat = new THREE.Quaternion();
			let targetScl = new THREE.Vector3();
			targetMatLocal.decompose(targetPos, targetQuat, targetScl);

			if (controller.state === 2 && target !== this.arScreen) {
				let vrSlide = target.components['vr-slide'];
				if (vrSlide) {
					vrSlide.onDrag(targetPos);
					controller.targetOrgLocal.decompose(new THREE.Vector3(), targetQuat, targetScl);
				}
				let vr1AxisHinge = target.components['vr-1axis-hinge'];
				if (vr1AxisHinge) {
					let rot = vr1AxisHinge.orgQuat.clone().invert();
					rot = rot.premultiply(targetQuat);
					let r = Math.acos(rot.w);
					switch (vr1AxisHinge.data.axis) {
						case 'x':
						case 'X':
							r *= rot.x / Math.sin(r);
							targetQuat.multiplyQuaternions(new THREE.Quaternion(Math.sin(r), 0, 0, Math.cos(r)), vr1AxisHinge.orgQuat);
							break;
						case 'y':
						case 'Y':
							r *= rot.y / Math.sin(r);
							targetQuat.multiplyQuaternions(new THREE.Quaternion(0, Math.sin(r), 0, Math.cos(r)), vr1AxisHinge.orgQuat);
							break;
						case 'z':
						case 'Z':
							r *= rot.z / Math.sin(r);
							targetQuat.multiplyQuaternions(new THREE.Quaternion(0, 0, Math.sin(r), Math.cos(r)), vr1AxisHinge.orgQuat);
							break;
						default: ;
					}
					targetPos.copy(vr1AxisHinge.orgPos);
				}

				for (let componentName in target.components) {
					if (componentName.startsWith('vr-snap')) {
						let vrSnapComp = target.components[componentName];
						if (vrSnapComp.snapped) {
							targetPos.copy(vrSnapComp.fixedPos);
							if (vrSnapComp.data.rotationMirror) {
								let eulerOffset = target.object3D.rotation.clone();
								eulerOffset.x -= vrSnapComp.initEuler.x;
								eulerOffset.y -= vrSnapComp.initEuler.y;
								eulerOffset.z -= vrSnapComp.initEuler.z;
								let quatOffset = new THREE.Quaternion().setFromEuler(eulerOffset);
								vrSnapComp.targetEl.object3D.quaternion.multiplyQuaternions(quatOffset, vrSnapComp.targetOrgQuat);
								vrSnapComp.targetEl.object3D.updateMatrix();
								if (interactionManagerComp)
									interactionManagerComp.writeInteraction(vrSnapComp.targetEl, 'transform', 'rotate');
							}
						}
					}
				}
			}

			target.object3D.position.copy(targetPos);
			target.object3D.quaternion.copy(targetQuat);
			target.object3D.scale.copy(targetScl);

			if (interactionManagerComp && target !== this.arScreen) {
				interactionManagerComp.writeInteraction(target, 'transform', 'total');
			}
		};
		processController(this.leftController);
		processController(this.rightController);
		if (this.rotationMode) {
			let target = this.leftController.targetEl;
			let leftPos = this.leftController.object3D.position;
			let rightPos = this.rightController.object3D.position;
			let curLeftToRight = new THREE.Vector3().subVectors(rightPos, leftPos);
			curLeftToRight.normalize();
			let quatOffset = new THREE.Quaternion().setFromUnitVectors(this.leftToRightVec, curLeftToRight);
			quatOffset.multiply(this.targetOrgQuat);
			target.object3D.quaternion.copy(quatOffset);
			if (interactionManagerComp) {
				interactionManagerComp.writeInteraction(target, 'transform', 'rotate');
			}
		}
		else if (this.scaleMode) {
			let target = this.leftController.targetEl;
			let leftPos = this.leftController.object3D.position;
			let rightPos = this.rightController.object3D.position;
			let curLeftToRight = new THREE.Vector3().subVectors(rightPos, leftPos);
			let magnification = (this.leftToRightVec.dot(curLeftToRight) >= 0) ? 1 : -1;
			magnification *= curLeftToRight.length() / this.leftToRightVec.length();
			target.object3D.scale.set(magnification, magnification, magnification);
			if (interactionManagerComp) {
				interactionManagerComp.writeInteraction(target, 'transform', 'scale');
			}
		}

		//Handling of movement by reflecting thumbstick input from both hands
		let totalMoveInput = new THREE.Vector3();
		if (this.leftController) {
			if (this.rightController) {
				totalMoveInput.addVectors(this.leftController.moveInput, this.rightController.moveInput);
			}
			else {
				totalMoveInput.copy(this.leftController.moveInput);
			}
		}
		else if (this.rightController) {
			totalMoveInput.copy(this.rightController.moveInput);
		}
		if (this.move3DMode === false) {
			totalMoveInput.y = 0;
			this.rig.object3D.position.y = this.data.floorHeight;
		}
		if (totalMoveInput.length() === 0) {
			this.prevMovingTime = null;
		}
		else {
			totalMoveInput.normalize();
			if (this.prevMovingTime) {
				let performNow = performance.now();
				let intervalSec = (performNow - this.prevMovingTime) / 1000;
				this.prevMovingTime = performNow;
				totalMoveInput.multiplyScalar(intervalSec * this.data.moveSpeed);
				this.rig.object3D.position.add(totalMoveInput);
			}
			else {
				this.prevMovingTime = performance.now();
			}
		}
	},

	remove: function () {
		this.el.removeEventListener('enter-vr', this.makeController);
		this.el.removeEventListener('exit-vr', this.destroyController);
		this.el.removeEventListener('enter-vr', this.makeArScreen);
		this.el.removeEventListener('exit-vr', this.destroyArScreen);
		this.el.removeEventListener('enter-vr', this.makeStreamingUI);
		this.el.removeEventListener('exit-vr', this.destroyStreamingUI);
	}
});

/**
 * The target object must have this component to be manipulated through the controller.
 * It is also required for mouse picking in 3D interaction mode.
 */
AFRAME.registerComponent('collidable', {
	schema: {}
}
);