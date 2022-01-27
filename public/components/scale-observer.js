/**
 * This component monitors whether an object is in a specific scale and propagates the result with a specific flag.
 */

AFRAME.registerComponent('scale-observer', {
	multiple: true,
	schema: {
		goal: { type: 'vec3' }, //target scale vector
		tolerance: { type: 'number', default: 0.1 }, //Distance between scale and goal
		flagName: { type: 'string' }, //Flag name to reflect the result
		onWorldCoordinate: { default: false } //Indicates whether the goal property is a value in worldcoordinate
	},

	init: function () {
		this.goalVec = null;
	},

	update: function (oldData) {
		if (oldData.goal !== this.data.goal) {
			if (!isNaN(this.data.goal.x) && !isNaN(this.data.goal.y) && !isNaN(this.data.goal.z)) {
				this.goalVec = new THREE.Vector3(this.data.goal.x, this.data.goal.y, this.data.goal.z);
			}
			else {
				this.goalVec = null;
			}
		}
	},

	play: function () {
	},

	pause: function () {
	},

	tick: function () {
		if (!this.goalVec) {
			this.setFlag(false);
			return;
		}
		this.updateFlag();
	},

	remove: function () {
	},

	updateFlag: function () {
		let dl;
		if (this.data.onWorldCoordinate) {
			let thisScale = new THREE.Vector3();
			this.el.object3D.getWorldScale(thisScale);
			dl = thisScale.distanceTo(this.goalVec);
		}
		else {
			dl = this.el.object3D.scale.distanceTo(this.goalVec);
		}
		this.setFlag(dl <= this.data.tolerance);
	},

	setFlag: function (flagVal) {
		let ftManager = this.el.sceneEl.flagTriggerManager;
		if (ftManager) {
			ftManager.setFlag(this.data.flagName, flagVal);
		}
	}
});
