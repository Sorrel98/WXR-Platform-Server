/**
 * This component listens the active marker was detected and sets the specific flag to true by the duration.
 */

AFRAME.registerComponent('detection-observer', {
	multiple: true,
	schema: {
		validDuration: { type: 'number', default: 100 }, // Duration by which the fact that the marker is being tracking is admitted.
		flagName: { type: 'string' }, // Flag name to set
	},

	init: function () {
		this.timerHandle = null;
		this.updateFlag = this.updateFlag.bind(this);
		this.el.addEventListener('markerDetected', this.updateFlag);
	},

	update: function (oldData) {
	},

	play: function () {
	},

	pause: function () {
	},

	tick: function () {
	},

	remove: function () {
		this.el.removeEventListener('markerDetected', this.updateFlag);
	},

	updateFlag: function () {
		this.setFlag(true);
		clearTimeout(this.timerHandle);
		this.timerHandle = setTimeout(() => {
			this.setFlag(false);
		}, this.data.validDuration);
	},

	setFlag: function (flagVal) {
		let ftManager = this.el.sceneEl.flagTriggerManager;
		if (ftManager) {
			ftManager.setFlag(this.data.flagName, flagVal);
		}
	}
});
