/**
 * This component sets the transparency of all meshes included in the object collectively.
 */

var utils = AFRAME.utils;
var bind = utils.bind;

AFRAME.registerComponent('transparency', {
	schema: {
		value: { default: 1 },
		for3D: { default: 1 },
		forVR: { default: 1 },
		forAR: { default: 1 }
	},

	init: function () {
		this.update = bind(this.update, this);
		this.apply = bind(this.apply, this);
		this.el.addEventListener('object3dset', this.update);
	},

	update: function (oldData) {
		for (let key in this.data) {
			const v = this.data[key];
			if (!isNaN(v)) {
				if (oldData[key] !== v) {
					this.data[key] = this.normalizedValue(v);
				}
			}
		}
		if (this.el.object3D) {
			this.apply(this.el.object3D, this.getCurrentMode());
		}
	},

	normalizedValue: function (value) {
		if (value < 0) {
			return 0;
		}
		else if (value > 1) {
			return 1;
		} else {
			return value;
		}
	},

	play: function () {
	},

	pause: function () {
	},

	tick: function () {
	},

	remove: function () {
		this.el.removeEventListener('object3dset', this.update);
	},

	apply: function (object3D, mode) {
		if (object3D.type === 'Mesh') {
			object3D.material.transparent = true;
			object3D.material.opacity = this.data.value * this.data[mode];
		}
		for (let child of object3D.children) {
			if (child.el == this.el)
				this.apply(child, mode);
		}
	},

	getCurrentMode: function () {
		const sceneEl = this.el.sceneEl;
		if (sceneEl.is('ar-mode')) {
			return 'forAR';
		} else if (sceneEl.is('vr-mode')) {
			return 'forVR';
		} else {
			return 'for3D';
		}
	}
});
