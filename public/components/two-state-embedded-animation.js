/**
 * This component play all animation clips netsted by the 3D model file.
 * The state is divided into the beginning and the end of the animation clips, and the change of state is reflected in a specific flag.
 * The animation clips are played to toggle the state when certain events are received. That is, the playback direction changes according to the state.
 */

AFRAME.registerComponent('two-state-embedded-animation', {
	schema: {
		state : {default: false},
		timeScale: {default: 1},
		triggerEvent: {type:'string'},
		flagName: {type:'string'}
	},

	init: function () {
		/** @type {THREE.Mesh} */
		this.model = null;
		/** @type {THREE.AnimationMixer} */
		this.mixer = null;
		/** @type {Array<THREE.AnimationAction>} */
		this.activeActions = [];

		this.playingClipNum = 0;
		
		this.duration = -1;
		
		const model = this.el.getObject3D('mesh');

		if (model) {
			this.load(model);
		} else {
			this.el.addEventListener('model-loaded', (e) => {
				this.load(e.detail.model);
			});
		}
		
		this.playConvertAnimation = this.playConvertAnimation.bind(this);
	},

	load: function (model) {
		const el = this.el;
		this.model = model;
		this.mixer = new THREE.AnimationMixer(model);
		this.mixer.addEventListener('finished', (e)=> {
			if(--this.playingClipNum === 0) {
				this.data.state = !this.data.state;
				this.setFlag(this.data.state);
			}
		});
		
		const clips = model.animations || (model.geometry || {}).animations || [];
		if(clips.length) {
			for (let clip, i = 0; (clip = clips[i]); ++i) {
				if(this.duration < clip.duration)
					this.duration = clip.duration;
				const action = this.mixer.clipAction(clip, model);
				action.clampWhenFinished = true;
				action.setLoop(THREE.LoopOnce, 0);
				this.activeActions.push(action);
			}
		}
	},

	remove: function () {
		if (this.mixer) this.mixer.stopAllAction();
	},

    update: function (prevData) {
		if(this.data.triggerEvent !== prevData.triggerEvent) {
			if(prevData.triggerEvent && prevData.triggerEvent !== '') {
				this.el.removeEventListener(prevData.triggerEvent, this.playConvertAnimation);
			}
			this.el.addEventListener(this.data.triggerEvent, this.playConvertAnimation);
		}
		if(this.data.state !== prevData.state) {
			this.onUpdateState();
			this.setFlag(this.data.state);
		}
    },

	stopAction: function () {
		for (let i = 0; i < this.activeActions.length; i++) {
			this.activeActions[i].stop();
		}
		this.activeActions.length = 0;
	},

	onUpdateState : function() {
		if(!this.mixer) return;
		if(this.activeActions.length > 0) {
			for(let action of this.activeActions) {
				action.stop();
				if(this.data.state === true) {
					action.time = this.duration;
				}
				else {
					action.time = 0 ;
				}
				action.setEffectiveTimeScale(0);
				action.play();
			}
		}
		this.playingClipNum = 0;
	},

	playConvertAnimation: function() {
		if (!this.mixer || this.playingClipNum > 0) return;
		if(this.activeActions.length > 0) {
			for(let action of this.activeActions) {
				action.stop();
				if(this.data.state === true) { //reverse play
					action.time = this.duration;
					action.setEffectiveTimeScale(-this.data.timeScale);
				}
				else { // forward play
					action.time = 0;
					action.setEffectiveTimeScale(this.data.timeScale);
				}
				action.play();
				++this.playingClipNum;
			}
		}
	},
  
	tick: function (t, dt) {
		if (this.mixer && !isNaN(dt)) this.mixer.update(dt / 1000);
	},
	
	setFlag: function(flagVal) {
		let ftManager = this.el.sceneEl.flagTriggerManager;
		if(ftManager) {
			ftManager.setFlag(this.data.flagName, flagVal);
		}
	}
});