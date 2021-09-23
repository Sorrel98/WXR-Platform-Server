/**
 * Manages a flag-trigger tree consisting of a flag node that is a leaf node and a trigger node that is not.
 * Observer components can set flag through this instance.
 */
class FlagTriggerManager {
	constructor() {
		this.sceneEl = document.querySelector('a-scene');
		this.flagsFromName = new Map(); //{key:flagName, value: {flagValue, refCnt}}
	}

	/**
	 * It updates the value of each trigger while traversing the flag-trigger tree postorder.
	 * When a certain flag value is updated or the structure of the tree is changed, the value of each node is updated appropriately.
	 */
	updateTree() {
		let dfs = (el)=>{
			for(let child of el.children) {
				if(child.components['trigger']) {
					dfs(child);
				}
			}
			el.components['trigger'].check();
		};
		for(let child of this.sceneEl.children) {
			if(child.components && child.components['trigger']) {
				dfs(child);
			}
		}
	}
	setFlag(name, val) {
		let item = this.flagsFromName.get(name);
		if(item) {
			item.flagValue = val;
			this.updateTree();
		}
	}
	addFlag(name, flag) {
		let item = this.flagsFromName.get(name);
		if(!item) {
			item = {flagValue:false, refCnt: 1};
			flag.flagRef = item;
			this.flagsFromName.set(name, item);
		}
		else {
			flag.flagRef = item;
			++item.refCnt;
		}
		this.propagate(flag.el);
	}
	removeFlag(name, flag) {
		flag.flagRef = null;
		let item = this.flagsFromName.get(name);
		if(--item.refCnt === 0) {
			this.flagsFromName.delete(name);
		}
		this.propagate(flag.el);
	}

	//Update values appropriately with bottom-up
	propagate(el) {
		let parentEl = el.parentEl;
		let parentTrigger = parentEl.components['trigger'];
		if(parentTrigger) {
			if(parentTrigger.check())
				this.propagate(parentEl);
		}
	}
};

/**
 * Represents a single boolean value as a leaf node in the flag-trigger tree.
 * By the flag-trigger manager, flags with the same name refer to the same value.
 */
AFRAME.registerComponent('flag', {
	schema: {
		name : {type: 'string'},
		inverse : {type: 'boolean'}
    },

    init: function () {
		let ftManager = this.el.sceneEl.flagTriggerManager;
		if(!ftManager) {
			this.el.sceneEl.flagTriggerManager = new FlagTriggerManager();
		}
		this.flagRef = null;
		this.viewNode = null;
    },

    update: function (oldData) {
		let ftManager = this.el.sceneEl.flagTriggerManager;
		if(oldData.name !== this.data.name) {
			if(oldData.name && oldData.name !== '') {
				ftManager.removeFlag(oldData.name, this);
			}
			if(this.data.name !== '') {
				ftManager.addFlag(this.data.name, this);
			}
			this.updateView();
		}
		if(oldData.inverse !== this.data.inverse) {
			this.updateView();
			ftManager.propagate(this.el);
		}
    },

    remove: function () {
		if(this.data.name !== '') {
			let ftManager = this.el.sceneEl.flagTriggerManager;
			ftManager.removeFlag(this.data.name, this);
		}
    },

	tick: function () {
		if(this.flagRef === null) return;
		this.updateView();
	},
	
    getValue: function() {
		if(this.flagRef === null) return;
		return this.data.inverse ? !this.flagRef.flagValue : this.flagRef.flagValue;
    },
	
	updateView: function() {
		if(this.viewNode) {
			$(this.viewNode).children('img')[1].style.display = this.getValue() ? 'inline' : 'none';
			$(this.viewNode).children('b')[0].innerHTML = '(' + (this.data.inverse ?'!':'') + this.data.name + ')';
		}
	}
});

/**
 * Represents a non-leaf node in the flag-trigger tree and represents a single Boolean algebraic expression.
 */
AFRAME.registerComponent('trigger', {
	schema: {
		type : {default: 'and', oneOf:['and', 'or']},
		inverse : {type: 'boolean'}, //About value
		risingEdgeEvent : {type: 'string'}, //Event to emit when value changes from false to true
		fallingEdgeEvent : {type: 'string'} //Event to emit when value changes from true to false
    },

    init: function () {
		this.value = false;
		let ftManager = this.el.sceneEl.flagTriggerManager;
		if(!ftManager) {
			this.el.sceneEl.flagTriggerManager = new FlagTriggerManager();
		}
		this.viewNode = null;
    },

    update: function (oldData) {
		if(oldData.type !== this.data.type) {
			if(this.check()) {
				this.el.sceneEl.flagTriggerManager.propagate(this.el);
			}
		}
		else if(oldData.inverse !== this.data.inverse) {
			this.updateView();
			this.el.sceneEl.flagTriggerManager.propagate(this.el);
		}
	},

	//Propagates the effect of removing this trigger as bottom-up.
    remove: function () {
		let parentTrigger = this.el.parentEl.components['trigger'];
		if(parentTrigger) {
			if(parentTrigger.data.type === 'and') {
				if(!this.getValue()) {
					this.value = !this.value;
				}
			}
			else {
				if(this.getValue()) {
					this.value = !this.value;
				}
			}
			if(parentTrigger.check()) {
				this.el.sceneEl.flagTriggerManager.propagate(this.el.parentEl);
			}
		}
    },
	
	/** 
	 * When the type is 'and', value is set to true when all children are true, and when the type is 'or', value is set to true when at least one child is true.
	 * If the value has been updated, the view is updated and true is returned.
	 */ 
	check: function() {
		let val = this.value;
		if(this.data.type === 'and') {
			val = true;
			for(let child of this.el.children) {
				let comp = child.components['trigger'] || child.components['flag'];
				if(comp) {
					if(!comp.getValue()) {
						val = false;
						break;
					}
				}
			}
		}
		else {
			val = false;
			for(let child of this.el.children) {
				let comp = child.components['trigger'] || child.components['flag'];
				if(comp) {
					if(comp.getValue()) {
						val = true;
						break;
					}
				}
			}
		}
		if(this.value !== val) {
			this.value = val;
			this.updateView();
			return true;
		}
		return false;
	},

	getValue: function() {
		return this.data.inverse ? !this.value : this.value;
	},
	
	//This method called when value changed.
	updateView: function() {
		if(this.viewNode) {
			$(this.viewNode).children('img')[1].style.display = this.getValue() ? 'inline' : 'none';
		}
		if(this.getValue()) { //rising Edge		
			if(this.data.risingEdgeEvent !== '') {
				this.el.sceneEl.emit(this.data.risingEdgeEvent);
			}
		}
		else { //falling Edge
			if(this.data.fallingEdgeEvent !== '') {
				this.el.sceneEl.emit(this.data.fallingEdgeEvent);
			}
		}
	}
});