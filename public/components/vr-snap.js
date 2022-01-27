/**
 * This component revise the transform to have a specific pose when an object approaches the target object.
 * Afterwards, depending on the option, the movement is restricted as if combined by a single-axis hinge, or it rotates together with the target object when rotating.
 */
AFRAME.registerComponent('vr-snap', {
	multiple: true,
	schema: {
		target: { type: 'string' },
		attachPoint: { type: 'vec3' },
		tolerance: { type: 'number', default: 0.1 }, //square of distance between attachPoint and target's origin
		initRotation: { type: 'vec3' },
		rotationMirror: { type: 'boolean' },
		hingeAxis: { type: 'string' }
	},

	init: function () {
		this.snapped = false;
		this.initEuler = null;
		this.checkTolerance = this.checkTolerance.bind(this);
	},

	update: function (oldData) {
		this.snapped = false;
		if (oldData.target !== this.data.target) {
			if (this.data.target === '')
				this.targetEl = null;
			else
				this.targetEl = document.querySelector(this.data.target);
		}
		if (oldData.initRotation !== this.data.initRotation) {
			this.initEuler = new THREE.Euler(THREE.Math.degToRad(this.data.initRotation.x), THREE.Math.degToRad(this.data.initRotation.y), THREE.Math.degToRad(this.data.initRotation.z), this.el.object3D.rotation.order);
		}
		this.checkTolerance(this.el.object3D.matrix);
	},

	play: function () {
	},

	pause: function () {
	},

	tick: function () {
	},

	remove: function () {
		if (this.snapped) {
			this.el.removeAttribute('vr-1axis-hinge');
		}
	},

	/**
	 * This function called from vr-mode-controls componet's onGripDown and onGripUp.
	 * The matrix passed as a parameter wants to be the local transform of this object.
	 * And if that happens, if the distance to the target is outside a certain threshold, the snapping is released and the matrix is applied.
	 * Otherwise, the passed matrix is ignored and snapped.
	 * This function returns true if the snap state has changed; otherwise, returns false.
	 */
	checkTolerance: function (matrix) {
		if (!this.targetEl) return false;
		let pos = new THREE.Vector4(this.data.attachPoint.x, this.data.attachPoint.y, this.data.attachPoint.z, 1);
		let matrixWorld = this.el.object3D.parent ? this.el.object3D.parent.matrixWorld.clone() : new THREE.Matrix4();
		matrixWorld.multiply(matrix);
		pos.applyMatrix4(matrixWorld);
		let disSqr = new THREE.Vector3(pos.x, pos.y, pos.z).distanceToSquared(this.targetEl.object3D.getWorldPosition(new THREE.Vector3()));
		if (disSqr > this.data.tolerance) {
			if (this.snapped) {
				let interactionManagerComp = this.el.sceneEl.components['interaction-manager'];
				if (interactionManagerComp) {
					interactionManagerComp.writeInteraction(this.targetEl, 'component', 'rotate', AFRAME.utils.coordinates.stringify(this.targetEl.object3D.rotation.toVector3().multiplyScalar(180 / Math.PI)));
				}
				matrix.decompose(this.el.object3D.position, this.el.object3D.quaternion, this.el.object3D.scale);
				this.el.object3D.updateMatrix();
				this.fixedPos = null;
				this.snapped = false;
				this.targetOrgQuat = null;
				this.el.removeAttribute('vr-1axis-hinge');
				return true;
			}
		}
		else {
			if (!this.snapped) {
				this.el.object3D.setRotationFromEuler(this.initEuler);
				this.el.object3D.position.set(0, 0, 0);
				this.el.object3D.updateMatrix();
				let attachPoint = new THREE.Vector4(this.data.attachPoint.x, this.data.attachPoint.y, this.data.attachPoint.z, 1);
				attachPoint.applyMatrix4(this.el.object3D.matrix);

				let targetWorldPos = new THREE.Vector3();
				this.targetEl.object3D.getWorldPosition(targetWorldPos);
				targetWorldPos = new THREE.Vector4(targetWorldPos.x, targetWorldPos.y, targetWorldPos.z, 1);
				let pw = this.el.object3D.parent ? this.el.object3D.parent.matrixWorld.clone() : new THREE.Matrix4();
				targetWorldPos.applyMatrix4(new THREE.Matrix4().copy(pw).invert());

				targetWorldPos.sub(attachPoint);
				this.el.object3D.position.set(targetWorldPos.x, targetWorldPos.y, targetWorldPos.z);
				this.el.object3D.updateMatrix();
				this.fixedPos = this.el.object3D.position.clone();
				this.targetOrgQuat = this.targetEl.object3D.quaternion.clone();
				this.snapped = true;
				if (this.data.hingeAxis !== '') {
					if (this.data.hingeAxis.length === 1) {
						this.el.setAttribute('vr-1axis-hinge', 'axis', this.data.hingeAxis[0]);
					}
					else if (this.data.hingeAxis.length === 2) {
					}
				}
				return true;
			}
		}
		return false;
	}
});