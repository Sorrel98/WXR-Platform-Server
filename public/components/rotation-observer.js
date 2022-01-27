/**
 * This component monitors whether an object is in a specific rotation and propagates the result with a specific flag.
 */

AFRAME.registerComponent('rotation-observer', {
	multiple: true,
	schema: {
		goal: { type: 'vec3' }, //target euler angle
		tolerance: { type: 'number', default: 0.1 }, //Half of the minimum angle in radian of rotation between the orientation and the goal
		flagName: { type: 'string' }, //Flag name to reflect the result
		onWorldCoordinate: { default: false } //Indicates whether the goal property is a value in worldcoordinate
	},

	init: function () {
		this.goalQuat = null;
	},

	update: function (oldData) {
		if (oldData.goal !== this.data.goal) {
			if (!isNaN(this.data.goal.x) && !isNaN(this.data.goal.y) && !isNaN(this.data.goal.z)) {
				let goalEuler = new THREE.Euler(THREE.Math.degToRad(this.data.goal.x), THREE.Math.degToRad(this.data.goal.y), THREE.Math.degToRad(this.data.goal.z), this.el.object3D.rotation.order);
				this.goalQuat = new THREE.Quaternion().setFromEuler(goalEuler);
			}
			else {
				this.goalQuat = null;
			}
		}
	},

	play: function () {
	},

	pause: function () {
	},

	tick: function () {
		if (!this.goalQuat) {
			this.setFlag(false);
			return;
		}
		this.updateFlag();
	},

	remove: function () {
	},

	updateFlag: function () {
		let curQuatInv;
		if (this.data.onWorldCoordinate) {
			curQuatInv = new THREE.Quaternion();
			this.el.object3D.getWorldQuaternion(curQuatInv);
			curQuatInv = curQuatInv.invert();
		}
		else {
			curQuatInv = this.el.object3D.quaternion.clone().invert();
		}
		let toleranceQuat = curQuatInv.multiply(this.goalQuat);
		this.setFlag(Math.acos(toleranceQuat.w) <= this.data.tolerance);
	},

	setFlag: function (flagVal) {
		let ftManager = this.el.sceneEl.flagTriggerManager;
		if (ftManager) {
			ftManager.setFlag(this.data.flagName, flagVal);
		}
	}
});
