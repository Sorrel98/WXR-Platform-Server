/**
 * This component sets the value of a certain property when a specific event is received.
 */

AFRAME.registerComponent('property-setter', {
	multiple: true,
	schema: {
		triggerEvent: { type: 'string' },
		propertyName: { type: 'string' },
		propertyValue: { type: 'string' }
	},

	init: function () {
		this.handler = this.handler.bind(this);
		this._events = [];
	},

	update: function (oldData) {
		if (this.data.triggerEvent !== oldData.triggerEvent) {
			if (oldData.triggerEvent && oldData.triggerEvent !== '') {
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
		if (this.data.triggerEvent !== '') {
			this.el.removeEventListener(this.data.triggerEvent, this.handler);
		}
	},

	handler: function () {
		let propertyPath = this.data.propertyName.split('.');
		if (propertyPath[0] !== '') {
			let comp = this.el.components[propertyPath[0]];
			if (comp) {
				AFRAME.utils.entity.setComponentProperty(this.el, this.data.propertyName, this.data.propertyValue);
			}
		}
	},

	addEventListeners: function () {
		let re = /\s*,\s*/;
		this._events = this.data.triggerEvent.split(re);
		for (let eventName of this._events) {
			this.el.addEventListener(eventName, this.handler);
		}
	},

	removeEventListeners: function () {
		for (let eventName of this._events) {
			this.el.removeEventListener(eventName, this.handler);
		}
	},
});