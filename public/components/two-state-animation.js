let getComponentProperty = AFRAME.utils.entity.getComponentProperty;
let setComponentProperty = AFRAME.utils.entity.setComponentProperty;

/**
 * This component animates the transition between the two state values of a specific property.
 * But, currently only number or int type properties are supported.
 */

AFRAME.registerComponent('two-state-animation', {
	schema: {
		state: { default: false },
		property: { type: 'string' }, //name of the property this object has
		from: { default: 0 }, //property value when state is false
		to: { default: 1 }, //property value when state is true
		duration: { default: 1000 }, //duration for transition
		triggerEvent: { type: 'string' }, //Event name that will trigger state toggling
		flagName: { type: 'string' } //Flag name to reflect the result
	},

	init: function () {
		this.isRunning = false;
		this.progress = 0;
		this.begin = this.begin.bind(this);
		this._events = [];
	},

	update: function (prevData) {
		if (this.data.triggerEvent !== prevData.triggerEvent) {
			if (prevData.triggerEvent && prevData.triggerEvent !== '') {
				this.removeEventListeners();
			}
			this.addEventListeners();
		}
		if (this.isRunning && this.data.property !== prevData.property) {
			this.isRunning = false;
		}
		if (this.data.state !== prevData.state) {
			this.setFlag(this.data.state);
			this.isRunning = true;
			this.onUpdateState();
		}
	},

	begin: function () {
		if (this.isRunning) return;
		try {
			let val = getComponentProperty(this.el, this.data.property);
			this.isRunning = true;
			this.progress = 0;
		}
		catch (e) {
		}
	},

	stop: function () {
		this.isRunning = false;
		this.data.state = !this.data.state;
		this.oldData.state = this.data.state;
		this.setFlag(this.data.state);
	},

	tick: function (t, dt) {
		if (!this.isRunning || isNaN(dt)) return;
		let newValue;
		this.progress += dt / this.data.duration;
		if (this.progress > 1) {
			this.progress = 1;
		}
		if (this.data.state) {
			newValue = this.progress * this.data.from + (1 - this.progress) * this.data.to;
		}
		else {
			newValue = (1 - this.progress) * this.data.from + this.progress * this.data.to;
		}
		setComponentProperty(this.el, this.data.property, newValue);
		if (this.progress === 1) {
			this.stop();
		}
	},

	remove: function () {
		if (this.data.triggerEvent !== '') {
			this.removeEventListeners();
		}
	},

	addEventListeners: function () {
		let re = /\s*,\s*/;
		this._events = this.data.triggerEvent.split(re);
		for (let eventName of this._events) {
			this.el.addEventListener(eventName, this.begin);
		}
	},

	removeEventListeners: function () {
		for (let eventName of this._events) {
			this.el.removeEventListener(eventName, this.begin);
		}
	},

	onUpdateState: function () {
		if (this.isRunning)
			this.isRunning = false;
		if (this.data.property && this.data.property !== '') {
			let val;
			if (this.data.state) {
				val = this.data.to;
			}
			else {
				val = this.data.from;
			}
			try {
				setComponentProperty(this.el, this.data.property, val);
			}
			catch (e) {
			}
		}
	},

	setFlag: function (flagVal) {
		let ftManager = this.el.sceneEl.flagTriggerManager;
		if (ftManager) {
			ftManager.setFlag(this.data.flagName, flagVal);
		}
	}
});