/**
 * This component loads the avatar model and creates a name tag.
 */

AFRAME.registerComponent('avatar', {
    schema: {
		modelPath : {type : 'string'},
		name : {type : 'string'},
		enableHand : {default: false}
	},

    init: function () {
		let mesh = new THREE.Group();
		this.el.setObject3D('mesh', mesh);
		let username = new THREE.Group();
		this.el.setObject3D('username', username);
		this.leftHand = null;
		this.rightHand = null;
		this.actions = ["Open", "Hold", "Point + Thumb", "Thumb Up", null, "Grip", "Point", "Fist"]
    },
  
    update: function (oldData) {
		if(this.data.modelPath !== oldData.modelPath) {
			let gltfLoader = new THREE.GLTFLoader();
			gltfLoader.load(this.data.modelPath, (gltf)=>{
				let model = gltf.scene || gltf.scenes[0];
				model.scale.multiplyScalar(0.25);
				let mesh = this.el.object3DMap['mesh'];
				mesh.add(model);
			});
		}
		if(this.data.name !== oldData.name) {
			this.makeNameTag(this.data.name);
		}
		if(this.data.enableHand !== oldData.enableHand) {
			if (this.data.enableHand) {
				this.makeHands();
			}
			else {
				this.destroyHands();
			}
		}
    },
  
    play: function() {
    },
  
    pause: function() {
    },
  
    tick: function (t, dt) {
		let nameMesh = this.el.object3DMap['username'];
		let cameraPos = this.el.sceneEl.camera.parent.position;
		let thisWorldPos = new THREE.Vector3();
		this.el.object3D.getWorldPosition(thisWorldPos);
		if(thisWorldPos.sub(cameraPos).lengthSq() > 100) {
			nameMesh.visible = false;
		}
		else {
			nameMesh.visible = true;
			nameMesh.lookAt(cameraPos);
		}

		if(this.data.enableHand) {
			if (this.leftHand && this.leftHand.visible && this.leftHand._animMixer && !isNaN(dt))
				this.leftHand._animMixer.update(dt / 1000);
			if (this.rightHand && this.rightHand.visible && this.leftHand._animMixer && !isNaN(dt))
				this.rightHand._animMixer.update(dt / 1000);
		}
    },
  
    remove: function () {
		this.leftHand._animMixer.stopAllAction();
		this.rightHand._animMixer.stopAllAction();
    },
	
	makeNameTag: function (name) {
		let username = this.el.object3DMap['username'];
		let fontLoader = new THREE.FontLoader();
		fontLoader.load('/fonts/Courier New_Regular.json', (font)=>{
			let textGeo = new THREE.TextGeometry(name, {
				font: font,
				size: 1,
				height: 0.001,
				curveSegments: 12,
				bevelEnabled: false
			});
			textGeo.computeBoundingBox();
			textGeo.computeVertexNormals();

			// textGeo = new THREE.BufferGeometry().fromGeometry( textGeo );
			textGeo.center();
			let textMaterial = new THREE.MeshPhongMaterial( { color: 0xffffff, flatShading: true } );
			let textMesh = new THREE.Mesh( textGeo,  textMaterial);
			username.add( textMesh );
			
			let width = 0.2 + textGeo.boundingBox.max.x - textGeo.boundingBox.min.x;
			let height = 0.2 + textGeo.boundingBox.max.y - textGeo.boundingBox.min.y;
			let bgPlaneGeo = new THREE.PlaneGeometry(width, height);
			let bgPlaneMaterial = new THREE.MeshPhongMaterial({color: 0x000000, opacity: 0.5, flatShading: true});
			let bgPlaneMesh = new THREE.Mesh(bgPlaneGeo, bgPlaneMaterial);
			bgPlaneMesh.position.z = -0.05;
			username.add(bgPlaneMesh);
			
			username.position.set(0, 0.5, 0);
			username.rotation.x = 0;
			username.rotation.y = Math.PI;
			username.scale.multiplyScalar(0.3);			
		});
	},

	makeHands: function() {
		let gltfLoader = new THREE.GLTFLoader();
		gltfLoader.load('/models/hand_left.glb', (gltf)=>{
			this.leftHand = gltf.scene || gltf.scenes[0];
			let mesh = this.el.object3DMap['mesh'];
			mesh.add(this.leftHand);
			this.leftHand.visible = false;
			this.leftHand.animations = gltf.animations;
			this.leftHand._animMixer = new THREE.AnimationMixer(this.leftHand);
			this.leftHand.lastClip = null;
		});
		gltfLoader.load('/models/hand_right.glb', (gltf)=>{
			this.rightHand = gltf.scene || gltf.scenes[0];
			let mesh = this.el.object3DMap['mesh'];
			mesh.add(this.rightHand);
			this.rightHand.visible = false;
			this.rightHand.animations = gltf.animations;
			this.rightHand._animMixer = new THREE.AnimationMixer(this.rightHand);
			this.rightHand.lastClip = null;
		});
	},

	destroyHands: function() {
		this.leftHand.parent.remove(this.leftHand);
		this.leftHand = null;
		this.rightHand.parent.remove(this.rightHand);
		this.rightHand = null;
	},

	setVisibleHandsIfExist: function(visible) {
		if(this.leftHand === null || this.leftHand === undefined) return;
		this.leftHand.visible = visible;
		this.rightHand.visible = visible;
	},

	setHandPose: function(worldPose) {
		let pos = new THREE.Vector3().fromArray(worldPose.left.pos);
		let quat = new THREE.Quaternion().fromArray(worldPose.left.rot);
		let scl = new THREE.Vector3(1, 1, 1);
		let mat = new THREE.Matrix4().compose(pos, quat, scl);
		mat = new THREE.Matrix4().getInverse(this.leftHand.parent.matrixWorld).multiply(mat);
		mat.decompose(this.leftHand.position, this.leftHand.quaternion, this.leftHand.scale);

		pos = new THREE.Vector3().fromArray(worldPose.right.pos);
		quat = new THREE.Quaternion().fromArray(worldPose.right.rot);
		mat = new THREE.Matrix4().compose(pos, quat, scl);
		mat = new THREE.Matrix4().getInverse(this.rightHand.parent.matrixWorld).multiply(mat);
		mat.decompose(this.rightHand.position, this.rightHand.quaternion, this.rightHand.scale);
	},

	setHandGesture: function(handSide, gesture) {
		let hand = (handSide === 0 ? this.leftHand : this.rightHand);
		if(hand && hand.visible) {
			hand._animMixer.stopAllAction();
			let actionName = this.actions[gesture];
			if (actionName) {
				let clip = THREE.AnimationClip.findByName( hand.animations, actionName );
				hand._animMixer.time = 0;
				hand._animMixer.timeScale = 1;
				let action = hand._animMixer.clipAction(clip);
				action.loop = THREE.LoopOnce;
				action.clampWhenFinished = true;
				hand.lastClip = action;
				action.play();
			}
			else {
				hand_animMixer.timeScale = -1;
				if (hand.lastClip) {
					hand.lastClip.play();
				}
			}
		}
	}
});