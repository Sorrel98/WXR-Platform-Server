var utils = AFRAME.utils;
var bind = utils.bind;

var ENTER_3D_CLASS = 'a-enter-3d';
var ENTER_3D_BTN_CLASS = 'a-enter-3d-button';
var ENTER_AR_CLASS = 'a-enter-ar';
var ENTER_AR_BTN_CLASS = 'a-enter-ar-button';
var ENTER_VR_CLASS = 'a-enter-vr';
var ENTER_VR_BTN_CLASS = 'a-enter-vr-button';
var HIDDEN_CLASS = 'a-hidden';
var ORIENTATION_MODAL_CLASS = 'a-orientation-modal';

AFRAME.registerComponent('mode-changer', {
    dependencies: ['canvas'],

    schema: {
    layer: {default: ''}
    },

    init: function () {
        var self = this;
        var sceneEl = this.el;

        this.insideLoader = false;
        this.enter3DEl = null;
        this.enterVREl = null;
        this.enterAREl = null;
        this.orientationModalEl = null;
        this.bindMethods();

        sceneEl.addEventListener('enter-ar', this.setARInterface);
        sceneEl.addEventListener('exit-ar', this.set3DInterface);
        sceneEl.addEventListener('enter-vr', this.setVRInterface);
        sceneEl.addEventListener('exit-vr', this.set3DInterface);

        window.addEventListener('message', function (event) {
            if (event.data.type === 'loaderReady') {
                self.insideLoader = true;
                self.remove();
            }
        });

        // Modal that tells the user to change orientation if in portrait.
        window.addEventListener('orientationchange', this.toggleOrientationModalIfNeeded);
    },

    bindMethods: function () {
        this.onEnterARButtonClick = bind(this.onEnterARButtonClick, this);
        this.onEnterVRButtonClick = bind(this.onEnterVRButtonClick, this);
        this.onEnter3DButtonClick = bind(this.onEnter3DButtonClick, this);
        this.setARInterface = bind(this.setARInterface, this);
        this.set3DInterface = bind(this.set3DInterface, this);
        this.setVRInterface = bind(this.setVRInterface, this);
        this.toggleOrientationModalIfNeeded = bind(this.toggleOrientationModalIfNeeded, this);
        this.onModalClick = bind(this.onModalClick, this);
    },

    onModalClick: function () {
        this.onEnter3DButtonClick();
    },
  
    onEnterARButtonClick: function () {
        if(this.el.is('vr-mode')) {
            this.el.exitVR();
        }
        let tdModeControlsComp = this.el.components['thd-mode-controls'];
        if (tdModeControlsComp.transformControls.object !== null) {
            const oldTarget = tdModeControlsComp.transformControls.object;
            tdModeControlsComp.transformControls.detach();
            tdModeControlsComp.el.emit('target-detached', { el: oldTarget }, false);
        }
        this.el._enterAR();
    },

    onEnterVRButtonClick: function () {
        if(this.el.is('ar-mode')) {
            this.el.exitAR();
        }
        let tdModeControlsComp = this.el.components['thd-mode-controls'];
        if (tdModeControlsComp.transformControls.object !== null) {
            const oldTarget = tdModeControlsComp.transformControls.object;
            tdModeControlsComp.transformControls.detach();
            tdModeControlsComp.el.emit('target-detached', { el: oldTarget }, false);
        }
        this.el.enterVR();
    },
  
    onEnter3DButtonClick: function () {
        if(this.el.is('vr-mode')) {
            this.el.exitVR();
        }
        else if(this.el.is('ar-mode')) {
            this.el.exitAR();
        }
    },
    update: function (oldData) {
        let data = this.data;
        let sceneEl = this.el;

        if (this.insideLoader) {
            return this.remove();
        }

        if(oldData.layer !== data.layer) {
            if(this.layer) {
                this.remove();
            }
            if(data.layer) {
                this.layer = document.querySelector(data.layer);
                this.enter3DEl = this.layer.children['_3DButton'];
                this.enterVREl = this.layer.children['_VRButton'];
                this.enterAREl = this.layer.children['_ARButton'];
                this.enter3DEl.addEventListener('click', this.onEnter3DButtonClick);
                this.enterVREl.addEventListener('click', this.onEnterVRButtonClick);
                this.enterAREl.addEventListener('click', this.onEnterARButtonClick);
                this.orientationModalEl = createOrientationModal(this.onModalClick);
                sceneEl.appendChild(this.orientationModalEl);
                this.enter3DEl.classList.add(HIDDEN_CLASS);
                this.layer.style.position = 'fixed';
                this.layer.style.zIndex = 9999;
                this.layer.style.width = Math.floor(this.el.sceneEl.offsetWidth * 0.04) + 'px';
                this.layer.style.minWidth = '40px';
                this.layer.style.height = (this.layer.offsetWidth * 2) + 'px';
                this.layer.style.left = this.el.sceneEl.offsetLeft + this.el.sceneEl.offsetWidth - this.layer.offsetWidth - 2 + 'px';
                this.layer.style.top = this.el.sceneEl.offsetTop + this.el.sceneEl.offsetHeight - this.layer.offsetHeight - 2 + 'px';
                this.layer.display = 'inline';
				window.addEventListener('resize', (e) => {
					this.layer.style.width = Math.floor(this.el.sceneEl.offsetWidth * 0.04) + 'px';
					this.layer.style.height = (this.layer.offsetWidth * 2) + 'px';
					this.layer.style.left = this.el.sceneEl.offsetLeft + this.el.sceneEl.offsetWidth - this.layer.offsetWidth - 2 + 'px';
					this.layer.style.top = this.el.sceneEl.offsetTop + this.el.sceneEl.offsetHeight - this.layer.offsetHeight - 2 + 'px';
				});
                this.enter3DEl.style.cursor = 'pointer';
				this.enter3DEl.style.padding = '2px';
                this.enter3DEl.style.width = 'calc(100% - 4px)';
                this.enterVREl.style.cursor = 'pointer';
				this.enterVREl.style.padding = '2px';
                this.enterVREl.style.width = 'calc(100% - 4px)';
                this.enterAREl.style.cursor = 'pointer';
				this.enterAREl.style.padding = '2px';
                this.enterAREl.style.width = 'calc(100% - 4px)';
            }
        }
        this.orientationModalEl.classList.add(HIDDEN_CLASS);
        //this.toggleOrientationModalIfNeeded();
    },

    remove: function () {
        [this.enter3DEl, this.enterVREl, this.enterAREl, this.orientationModalEl].forEach(function (uiElement) {
            if (uiElement && uiElement.parentNode) {
                uiElement.parentNode.removeChild(uiElement);
            }
        });
    },
    
    setARInterface: function () {
        let sceneEl = this.el;
        if (!this.enterAREl) { return; }
        sceneEl.components['thd-mode-controls'].toggleUIDisplay(false);
        this.enter3DEl.classList.remove(HIDDEN_CLASS);
        this.enterVREl.classList.remove(HIDDEN_CLASS);
        this.enterAREl.classList.add(HIDDEN_CLASS);
    },
    
    set3DInterface: function () {
        let sceneEl = this.el;
        if (!this.enter3DEl) { return; }
        sceneEl.components['thd-mode-controls'].toggleUIDisplay(true);
        this.enter3DEl.classList.add(HIDDEN_CLASS);
        this.enterVREl.classList.remove(HIDDEN_CLASS);
        this.enterAREl.classList.remove(HIDDEN_CLASS);
    },
    
    setVRInterface: function () {
        let sceneEl = this.el;
        if(!this.enterVREl) { return; }
        sceneEl.components['thd-mode-controls'].toggleUIDisplay(false);
        this.enter3DEl.classList.remove(HIDDEN_CLASS);
        this.enterVREl.classList.add(HIDDEN_CLASS);
        this.enterAREl.classList.remove(HIDDEN_CLASS);
    },
});

/**
 * Create a button that when clicked will enter into stereo-rendering mode for VR.
 *
 * Structure: <div><button></div>
 *
 * @param {function} onClick - click event handler
 * @returns {Element} Wrapper <div>.
 */
function createEnterVRButton (onClick) {
  var vrButton;
  var wrapper;

  // Create elements.
  wrapper = document.createElement('div');
  wrapper.classList.add(ENTER_VR_CLASS);
  wrapper.setAttribute('aframe-injected', '');
  vrButton = document.createElement('button');
  vrButton.id = '_VRButton';
  vrButton.className = ENTER_VR_BTN_CLASS;
  vrButton.setAttribute('title',
    'Enter VR mode with a headset or fullscreen mode on a desktop. ' +
    'Visit https://webvr.rocks or https://webvr.info for more information.');
  vrButton.setAttribute('aframe-injected', '');

  // Insert elements.
  wrapper.appendChild(vrButton);
  vrButton.addEventListener('click', function (evt) {
    onClick();
    evt.stopPropagation();
  });
  return wrapper;
}

/**
 * Create a button that when clicked will enter into AR mode.
 *
 * Structure: <div><button></div>
 *
 * @param {function} onClick - click event handler
 * @returns {Element} Wrapper <div>.
 */
function createEnterARButton (onClick) {
  var arButton;
  var wrapper;

  // Create elements.
  wrapper = document.createElement('div');
  wrapper.classList.add(ENTER_AR_CLASS);
  wrapper.setAttribute('aframe-injected', '');
  arButton = document.createElement('button');
  arButton.className = ENTER_AR_BTN_CLASS;
  arButton.setAttribute('title',
    'Enter AR mode on a mobile device. ');
  arButton.setAttribute('aframe-injected', '');

  // Insert elements.
  wrapper.appendChild(arButton);
  arButton.addEventListener('click', function (evt) {
    onClick();
    evt.stopPropagation();
  });
  return wrapper;
}

/**
 * Creates a modal dialog to request the user to switch to landscape orientation.
 *
 * @param {function} onClick - click event handler
 * @returns {Element} Wrapper <div>.
 */
function createOrientationModal (onClick) {
  var modal = document.createElement('div');
  modal.className = ORIENTATION_MODAL_CLASS;
  modal.classList.add(HIDDEN_CLASS);
  modal.setAttribute('aframe-injected', '');

  var exit = document.createElement('button');
  exit.setAttribute('aframe-injected', '');
  exit.innerHTML = 'Exit VR';

  // Exit VR on close.
  exit.addEventListener('click', onClick);

  modal.appendChild(exit);

  return modal;
}
