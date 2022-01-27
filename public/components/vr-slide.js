/**
 * This component makes the object move as if it was fixed by the slide during VR interaction.
 * Two or more stoppers are equally spaced on the slide.
 * And the moment the grip is released, the object is forcibly moved to the nearest stopper.
 * That is, one stopper is always selected, and when the selected stopper is changed, an event with a name numbered to a specific prefix can be emitted.
 */

AFRAME.registerComponent('vr-slide', {
	dependencies: ['position'],

	schema: {
		criteriaPosition: { type: 'vec3' },
		slideDirection: { default: '+x', oneOf: ['+x', '-x', '+y', '-y', '+z', '-z'] },
		length: { type: 'number', default: 1, min: 0.001 },
		numberOfStopper: { type: 'int', default: 2, min: 2 },
		eventPrefix: { type: 'string' }
	},

	//Find the nearest stopper by binary search
	getNearestStopperIdx(b, e, t) {
		if (b > e) {
			b = -b;
			e = -e;
			t = -t;
		}
		if (t < b) return 0;
		if (e <= t) return this.data.numberOfStopper - 1;
		// assert : b <= t < e

		let d = this.data.length / (this.data.numberOfStopper - 1);

		let f = (p) => {
			return b + p * d <= t;
		};

		let lo = 0;
		let hi = this.data.numberOfStopper - 1;
		while (lo + 1 !== hi) {
			//assert : f(lo) is true, f(hi) is false
			let m = Math.floor((lo + hi) / 2);
			if (f(m))
				lo = m;
			else
				hi = m;
		}

		return (2 * (t - (b + lo * d)) < d) ? lo : hi;
	},

	init: function () {
		let data = this.data;
		if (data.length <= 0)
			data.length = 1;
		if (data.numberOfStopper < 2)
			data.numberOfStopper = 2;

		let deltaL = data.length / data.numberOfStopper;
		if (data.slideDirection[0] === '-') deltaL = -deltaL;

		let pos = this.el.getAttribute('position');

		this.currentStopperIdx = -1;

		switch (data.slideDirection[1]) {
			case 'x':
				pos.y = data.criteriaPosition.y;
				pos.z = data.criteriaPosition.z;
				this.currentStopperIdx = this.getNearestStopperIdx(data.criteriaPosition.x, data.criteriaPosition.x + data.length, pos.x);
				pos.x = data.criteriaPosition.x + this.currentStopperIdx * deltaL;
				break;
			case 'y':
				pos.x = data.criteriaPosition.x;
				pos.z = data.criteriaPosition.z;
				this.currentStopperIdx = this.getNearestStopperIdx(data.criteriaPosition.y, data.criteriaPosition.y + data.length, pos.y);
				pos.y = data.criteriaPosition.y + this.currentStopperIdx * deltaL;
				break;
			case 'z':
				pos.x = data.criteriaPosition.x;
				pos.y = data.criteriaPosition.y;
				this.currentStopperIdx = this.getNearestStopperIdx(data.criteriaPosition.z, data.criteriaPosition.z + data.length, pos.z);
				pos.z = data.criteriaPosition.z + this.currentStopperIdx * deltaL;
				break;
		}
	},

	update: function (oldData) {
		if (isNaN(this.data.numberOfStopper) || this.data.numberOfStopper < 2)
			this.data.numberOfStopper = 2;
		if (oldData.slideDirection !== this.data.slideDirection || oldData.length !== this.data.length || oldData.numberOfStopper !== this.data.numberOfStopper)
			currentStopperIdx = -1;
	},

	play: function () {
	},

	pause: function () {
	},

	tick: function () {
		let data = this.data;
		let pos = this.el.getAttribute('position');
		let increment = ((data.slideDirection[0] === '-') ? -1 : 1) * data.length;
		let deltaL = increment / (data.numberOfStopper - 1);
		let orgIdx = this.currentStopperIdx;
		this.currentStopperIdx = -1;
		switch (data.slideDirection[1]) {
			case 'x':
				if (pos.y === data.criteriaPosition.y && pos.z === data.criteriaPosition.z) {
					this.currentStopperIdx = this.getNearestStopperIdx(data.criteriaPosition.x, data.criteriaPosition.x + increment, pos.x);
				}
				break;
			case 'y':
				if (pos.x === data.criteriaPosition.x && pos.z === data.criteriaPosition.z) {
					this.currentStopperIdx = this.getNearestStopperIdx(data.criteriaPosition.y, data.criteriaPosition.y + increment, pos.y);
				}
				break;
			case 'z':
				if (pos.x === data.criteriaPosition.x && pos.y === data.criteriaPosition.y) {
					this.currentStopperIdx = this.getNearestStopperIdx(data.criteriaPosition.z, data.criteriaPosition.z + increment, pos.z);
				}
				break;
		}
		if (orgIdx !== this.currentStopperIdx && this.currentStopperIdx !== -1) {
			if (this.data.eventPrefix !== '') {
				this.el.sceneEl.emit(this.data.eventPrefix + this.currentStopperIdx, null, false);
			}
		}
	},

	remove: function () {
	},

	onDrag: function (pos) {
		// revise pos
		let data = this.data;
		switch (data.slideDirection[1]) {
			case 'x':
				pos.y = data.criteriaPosition.y;
				pos.z = data.criteriaPosition.z;
				if (data.slideDirection[0] === '+') {
					if (pos.x < data.criteriaPosition.x)
						pos.x = data.criteriaPosition.x;
					else if (pos.x > data.criteriaPosition.x + data.length)
						pos.x = data.criteriaPosition.x + data.length;
				}
				else {
					if (pos.x < data.criteriaPosition.x - data.length)
						pos.x = data.criteriaPosition.x - data.length;
					else if (pos.x > data.criteriaPosition.x)
						pos.x = data.criteriaPosition.x;
				}
				break;
			case 'y':
				pos.x = data.criteriaPosition.x;
				pos.z = data.criteriaPosition.z;
				if (data.slideDirection[0] === '+') {
					if (pos.y < data.criteriaPosition.y)
						pos.y = data.criteriaPosition.y;
					else if (pos.y > data.criteriaPosition.y + data.length)
						pos.y = data.criteriaPosition.y + data.length;
				}
				else {
					if (pos.y < data.criteriaPosition.y - data.length)
						pos.y = data.criteriaPosition.y - data.length;
					else if (pos.y > data.criteriaPosition.y)
						pos.y = data.criteriaPosition.y;
				}
				break;
			case 'z':
				pos.x = data.criteriaPosition.x;
				pos.y = data.criteriaPosition.y;
				if (data.slideDirection[0] === '+') {
					if (pos.z < data.criteriaPosition.z)
						pos.z = data.criteriaPosition.z;
					else if (pos.z > data.criteriaPosition.z + data.length)
						pos.z = data.criteriaPosition.z + data.length;
				}
				else {
					if (pos.z < data.criteriaPosition.z - data.length)
						pos.z = data.criteriaPosition.z - data.length;
					else if (pos.z > data.criteriaPosition.z)
						pos.z = data.criteriaPosition.z;
				}
				break;
		}
	},

	onRelease: function () {
		let data = this.data;
		let pos = this.el.getAttribute('position');
		let increment = ((data.slideDirection[0] === '-') ? -1 : 1) * data.length;
		let deltaL = increment / (data.numberOfStopper - 1);

		if (this.currentStopperIdx != -1) {
			switch (data.slideDirection[1]) {
				case 'x':
					pos.x = data.criteriaPosition.x + this.currentStopperIdx * deltaL;
					break;
				case 'y':
					pos.y = data.criteriaPosition.y + this.currentStopperIdx * deltaL;
					break;
				case 'z':
					pos.z = data.criteriaPosition.z + this.currentStopperIdx * deltaL;
					break;
			}
		}
		else {

		}
	}
});