/**
 * This component sets the transparency of all meshes included in the object collectively.
 */

AFRAME.registerComponent('transparency', {
    schema: {
		value: {default : 1}
    },

    init: function () {
		this.objectSetHandler = ()=>{
			if(!isNaN(this.data)) {
				if(this.data < 0) {
					this.data = 0;
				}
				else if(this.data > 1) {
					this.data = 1;
				}
				if(this.el.object3D) {
					this.apply(this.el.object3D);
				}
			}
		};
		this.el.addEventListener('object3dset', this.objectSetHandler);
    },

    update: function (oldData) {
		if(!isNaN(this.data.value)) {
			if(oldData.value !== this.data.value) {
				if(this.data.value < 0) {
					this.data.value = 0;
				}
				else if(this.data.value > 1) {
					this.data.value = 1;
				}
				if(this.el.object3D) {
					this.apply(this.el.object3D);
				}
				
			}
		}
	},

    play: function() {
    },

    pause: function() {
    },

    tick: function () {
    },

    remove: function () {
		this.el.removeEventListener('object3dset', this.objectSetHandler);
    },

	apply: function (object3D) {
		if(object3D.type === 'Mesh') {
			object3D.material.transparent = true;
			object3D.material.opacity = this.data.value;
		}
		for(let child of object3D.children) {
			if(child.el == this.el)
			this.apply(child);
		}
	}
});
