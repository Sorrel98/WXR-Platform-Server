/**
 * This component captures specific events from an a-scene object and propagates them to this object.
 * However, only the name of the event is transmitted, so separate data cannot be transmitted.
 */

AFRAME.registerComponent('event-capturer', {
	multiple: true,
	schema: {
		targetEvent: { type: 'string' } // Multiple events can be listed, separated by commas.
	},

	init: function () {
		this.handlers = [];
		this._events = [];
	},

	update: function (oldData) {
		if (this.data.targetEvent !== oldData.targetEvent) {
			if (oldData.targetEvent !== '') {
				this.removeEventListeners();
			}
			this.addEventListeners();
		}
	},

	play: function () {
	},

	pause: function () {
	},

	tick: function () {

	},

	remove: function () {
		if (this.data.targetEvent !== '') {
			this.removeEventListeners();
		}
	},

	handler: function (evtName) {
		this.el.emit(evtName, null, false);
	},

	addEventListeners: function () {
		let re = /\s*,\s*/;
		this._events = this.data.targetEvent.split(re);
		handlers = [];
		for (let eventName of this._events) {
			let handler = this.handler.bind(this, eventName);
			handlers.push(handler);
			this.el.sceneEl.addEventListener(eventName, handler);
		}
	},

	removeEventListeners: function () {
		let idx = 0;
		for (let eventName of this._events) {
			this.el.sceneEl.removeEventListener(eventName, this.handlers[idx]);
		}
	},
});