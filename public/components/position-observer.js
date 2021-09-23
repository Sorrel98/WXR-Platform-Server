/**
 * This component monitors whether an object is in a specific position and propagates the result with a specific flag.
 */

AFRAME.registerComponent('position-observer', {
    multiple: true,
	schema: {
		goal : {type: 'vec3'}, //target position vector
		tolerance : {type: 'number', default: 0.1}, //Distance between position and goal
		flagName : {type: 'string'}, //Flag name to reflect the result
		onWorldCoordinate : {default : false} //Indicates whether the goal property is a value in worldcoordinate
    },

    init: function () {
		this.goalVec = null;
    },

    update: function (oldData) {
		if(oldData.goal !== this.data.goal) {
			if(!isNaN(this.data.goal.x) && !isNaN(this.data.goal.y) && !isNaN(this.data.goal.z)) {
				this.goalVec = new THREE.Vector3(this.data.goal.x, this.data.goal.y, this.data.goal.z);
			}
			else {
				this.goalVec = null;
			}
		}
	},

    play: function() {
    },

    pause: function() {
    },

    tick: function () {
		if(!this.goalVec) {
			this.setFlag(false);
			return;
		}
		this.updateFlag();
    },

    remove: function () {
    },
	
	updateFlag: function() {
		let thisPos;
		if(this.data.onWorldCoordinate) {
			thisPos = new THREE.Vector3();
			this.el.object3D.getWorldPosition(thisPos);
			
		}
		else {
			thisPos = this.el.object3D.position;
		}
		let dl = thisPos.distanceTo(this.goalVec);
		this.setFlag(dl <= this.data.tolerance);
	},
	
	setFlag: function(flagVal) {
		let ftManager = this.el.sceneEl.flagTriggerManager;
		if(ftManager) {
			ftManager.setFlag(this.data.flagName, flagVal);
		}
	}
});
