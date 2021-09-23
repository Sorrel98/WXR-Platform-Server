/**
 * This component monitors whether an object is colliding with another specific object and propagates the result to a specific flag.
 * This object and the target object must have the collidable attribute for collision detection.
 * This component can cause significant performance degradation.
 */

AFRAME.registerComponent('collision-observer', {
    multiple: true,
	schema: {
		target : {type: 'string'}, //CSS Selector
		flagName : {type: 'string'} //Flag name to reflect the result
    },

    init: function () {
		this.targetEl = null;
		this.targetColliders = [];
		this.thisColliders = [];
    },

    update: function (oldData) {
		if(this.data.target !== oldData.target) {
			if(this.data.target !== '')
				this.targetEl = document.querySelector(this.data.target);
			else
				this.targetEl = null;
			this.targetColliders = [];
		}
	},

    play: function() {
    },

    pause: function() {
    },

    tick: function () {
		if(!this.targetEl) return;
		this.updateFlag();
    },

    remove: function () {
    },
	
	updateFlag: function() {
		if(!this.el.hasAttribute('collidable')) return;
		if(!this.targetEl || !this.targetEl.hasAttribute('collidable')) return;
		this.thisColliders = [];
		this.collectColliders(this.el.object3D, this.thisColliders);
		this.targetColliders = [];
		this.collectColliders(this.targetEl.object3D, this.targetColliders);
		
		let collision = false;
		for(let i = 0; i < this.thisColliders.length; ++i) {
			let ci = this.el.object3D.localToWorld(this.thisColliders[i].clone());
			for(let j = 0; j < this.targetColliders.length; ++j) {
				let cj = this.targetEl.object3D.localToWorld(this.targetColliders[j].clone());
				if(cj.radius !== undefined) {
					collision = ci.intersectsSphere(cj);
				}
				else {
					collision = ci.intersectsBox(cj);
				}
				if(collision)
					break;
			}
			if(collision)
				break;
		}
		this.setFlag(collision);
	},
	
	setFlag: function(flagVal) {
		let ftManager = this.el.sceneEl.flagTriggerManager;
		if(ftManager) {
			ftManager.setFlag(this.data.flagName, flagVal);
		}
	},
	
	//Colliders are formed at obscure points of time, so they inevitably need to be called every frame.
	collectColliders: function(object3D, dst) {
		for(let child of object3D.children) {
			if(child.el !== object3D.el) continue;
			if(child.geometry) {
				let bound = child.geometry.boundingSphere || child.geometry.boundingBox;
				if(bound === null) {
					child.geometry.computeBoundingSphere();
					bound = child.geometry.boundingSphere;
				}
				bound = child.localToWorld(bound.clone());
				bound = child.el.object3D.worldToLocal(bound);
				dst.push(bound);
			}
			else {
				this.collectColliders(child, dst);
			}
		}
	}
});
