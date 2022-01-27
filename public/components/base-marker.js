/**
 * This component set the base marker for AR mode Interaction.
 */

AFRAME.registerComponent('base-marker', {
	schema: {
		src: { type: 'string' } //target path
	},

	init: function () {
	},

	update: function (oldData) {
		let sceneEl = this.el.sceneEl;
		if (sceneEl.hasLoaded) {
			let arModeComp = sceneEl.components['ar-mode-controls'];
			if (arModeComp) {
				if (oldData.src) {
					arModeComp.ARTracker.popBaseMarker(oldData.src);
				}
				if (this.data.src !== '')
					arModeComp.ARTracker.pushBaseMarker(this.data.src);
			}
		}
		else {
			sceneEl.addEventListener('loaded', () => {
				let arModeComp = sceneEl.components['ar-mode-controls'];
				if (arModeComp) {
					if (oldData.src) {
						arModeComp.ARTracker.popBaseMarker(oldData.src);
					}
					if (this.data.src !== '')
						arModeComp.ARTracker.pushBaseMarker(this.data.src);
				}
			});
		}
	},

	play: function () {
	},

	pause: function () {
	},

	tick: function () {
	},

	remove: function () {
		let sceneEl = this.el.sceneEl;
		let arModeComp = sceneEl.components['ar-mode-contorls'];
		if (arModeComp) {
			if (this.data.src) {
				arModeComp.ARTracker.popBaseMarker(this.data.src);
			}
		}
	}
});
