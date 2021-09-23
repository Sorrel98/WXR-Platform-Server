/**
 * This component allows limited transformations in VR interaction mode as if this object was fixed by a single-axis hinge.
 * The logic is implemented in the vr-mode-controls component because of its sequence dependency with some other components.
 */

AFRAME.registerComponent('vr-1axis-hinge', {
	schema: {
		axis : {default: 'x', oneOf:['x', 'y', 'z']}
    },
	init: function() {
	},
	update: function(oldData) {
		this.orgPos = this.el.object3D.position.clone();
		this.orgQuat = this.el.object3D.quaternion.clone();
	}
});