/**
 * This component makes this object's transform immutable in the object space of a particular active marker.
 */
AFRAME.registerComponent('target', {
    schema: {
        marker: { type: 'string' } //CSS selector
    },

    init: function () {
        this.markerToThisMatrix = new THREE.Matrix4();
        this.markerEl = null;
        this.onMarkerMoved = this.onMarkerMoved.bind(this);
        this.setRelativeMatrix = this.setRelativeMatrix.bind(this);
        this.el.onTransformChangedBySync = this.setRelativeMatrix;
        this.el.sceneEl.addEventListener('enter-ar', this.setRelativeMatrix);
    },

    update: function (oldData) {
        if (oldData.marker !== this.data.marker) {
            if (oldData.marker) {
                this.markerToThisMatrix = new THREE.Matrix4();
                if (this.markerEl) {
                    this.markerEl.removeEventListener('transformChanged', this.onMarkerMoved);
                    this.markerEl = null;
                }
            }
            if (this.data.marker) {
                this.markerEl = document.querySelector(this.data.marker);
                if (this.markerEl) {
                    this.markerEl.addEventListener('transformChanged', this.onMarkerMoved);
                }

            }
        }
    },

    play: function () {
    },

    pause: function () {
    },

    tick: function () {
    },

    remove: function () {
        if (this.markerEl)
            this.markerEl.removeEventListener('transformChanged', this.onMarkerMoved);
        this.el.sceneEl.removeEventListener('enter-ar', this.setRelativeMatrix);
    },

    onMarkerMoved: function () {
        if (this.el.sceneEl.is('ar-mode')) {
            let newMatrix = this.markerEl.object3D.matrixWorld.clone().multiply(this.markerToThisMatrix);
            newMatrix.premultiply((new THREE.Matrix4()).copy(this.el.object3D.parent.matrixWorld).invert());
            newMatrix.decompose(this.el.object3D.position, this.el.object3D.quaternion, this.el.object3D.scale);
            this.el.object3D.updateMatrix();
            let interactionManagerComp = this.el.sceneEl.components['interaction-manager'];
            if (interactionManagerComp) {
                interactionManagerComp.writeInteraction(this.el, 'transform', 'total');
            }
        }
    },

    setRelativeMatrix: function () {
        if (this.markerEl) {
            this.markerToThisMatrix.copy(this.markerEl.object3D.matrixWorld).invert();
            this.markerToThisMatrix.multiply(this.el.object3D.matrixWorld);
        }
    }
});
