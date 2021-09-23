/**
 * This component set the active marker for AR mode interaction.
 */

AFRAME.registerComponent('active-marker', {
    schema: {
        src: {type: 'string'}
    },

    init: function () {
		this.updatedOnLastFrame = false;
		this.orgMatrix = null;
        this.el.setObject3D('mesh', new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.001, 0.1), new THREE.MeshBasicMaterial({color:0xffff00, wireframe:true})));
        //this.el.object3D.children[0].setRotationFromQuaternion(new THREE.Quaternion(Math.sqrt(2)/2, 0, 0, Math.sqrt(2)/2));
    },
  
    update: function (oldData) {
        let sceneEl = this.el.sceneEl;
		if(sceneEl.hasLoaded) {
			let arModeComp = sceneEl.components['ar-mode-controls'];		
			if(arModeComp) {
				if(oldData.src) {
					arModeComp.ARTracker.popActiveMarker(oldData.src);
				}
				if(this.data.src !== '')
					arModeComp.ARTracker.pushActiveMarker(this);
			}
		}
		else {
			sceneEl.addEventListener('loaded',()=>{
				let arModeComp = sceneEl.components['ar-mode-controls'];		
				if(arModeComp) {
					if(oldData.src) {
						arModeComp.ARTracker.popActiveMarker(oldData.src);
					}
					if(this.data.src !== '')
						arModeComp.ARTracker.pushActiveMarker(this);
				}
			});
		}
    },
  
    play: function() {
    },
  
    pause: function() {
    },
  
    tick: function () {
    },
  
    remove: function () {
		let sceneEl = this.el.sceneEl;
		let arModeComp = sceneEl.components['ar-mode-contorls'];
		if(arModeComp) {
			if(this.data.src) {
				arModeComp.ARTracker.popActiveMarker(this.data.src);
			}
		}
    }
});
