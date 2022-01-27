/**
 * This component animates the behavior of a hinge.
 * Animations support forward and reverse, each of which can be triggered by an arbitrary event.
 * You can also fire an arbitrary event when the animation ends.
 */
AFRAME.registerComponent('hinge-animation', {
    schema: {
        triggerEvent: { type: 'string' },//Event to trigger forward animation
        reverseTriggerEvent: { type: 'string' }, //Event to trigger reverse animation
        emitEndEvent: { type: 'string' }, //Event to be emitted when forward animation ends
        emitReverseEndEvent: { type: 'string' }, //Event to be emitted when reverse animation ends
        fps: { type: 'int' }, //Frame per second
        duration: { type: 'int' },
        startPos: { type: 'vec3' },
        startPivot: { type: 'vec3' },
        startRot: { type: 'vec3' },
        endRot: { type: 'vec3' }
    },
    init: function () {
        this.op = new THREE.Vector3();
        this.orgMat = null;
        this.startQuat = new THREE.Quaternion();
        this.endQuat = new THREE.Quaternion();
        this.trgEvtListener = null;
        this.startAnimation = this.startAnimation.bind(this);
        this.startReverseAnimation = this.startReverseAnimation.bind(this);
        this.loop = null;
    },
    update: function (oldData) {
        this.op.addVectors(this.data.startPos, this.data.startPivot);
        this.startQuat.setFromEuler(new THREE.Euler(this.data.startRot.x * Math.PI / 180, this.data.startRot.y * Math.PI / 180, this.data.startRot.z * Math.PI / 180, this.el.object3D.rotation.order));
        this.endQuat.setFromEuler(new THREE.Euler(this.data.endRot.x * Math.PI / 180, this.data.endRot.y * Math.PI / 180, this.data.endRot.z * Math.PI / 180, this.el.object3D.rotation.order));
        if (this.data.triggerEvent !== '') {
            if (oldData.triggerEvent !== '')
                this.el.sceneEl.removeEventListener(oldData.triggerEvent, this.startAnimation);
            this.el.sceneEl.addEventListener(this.data.triggerEvent, this.startAnimation);
        }
        if (this.data.reverseTriggerEvent !== '') {
            if (oldData.reverseTriggerEvent !== '')
                this.el.sceneEl.removeEventListener(oldData.reverseTriggerEvent, this.startReverseAnimation);
            this.el.sceneEl.addEventListener(this.data.reverseTriggerEvent, this.startReverseAnimation);
        }
    },
    play: function () {
    },
    pause: function () {
    },
    tick: function () {
    },
    remove: function () {
        if (this.loop)
            clearInterval(this.loop);
        if (this.data.triggerEvent !== '')
            this.el.sceneEl.removeEventListener(this.data.triggerEvent, this.startAnimation);
    },
    startAnimation: function () {
        this.orgMat = this.el.object3D.matrix.clone();
        if (this.data.duration > 0 && this.data.fps > 0) {
            let cnt = 0;
            let maxCnt = Math.floor(this.data.fps * this.data.duration / 1000);
            if (maxCnt > 0) {
                if (this.loop === null) {
                    this.loop = setInterval(() => {
                        let t = cnt / maxCnt;
                        this.applyTransform(t);
                        ++cnt;
                        if (cnt > maxCnt) {
                            clearInterval(this.loop);
                            this.loop = null;
                            let interactionManagerComp = this.el.sceneEl.components['interaction-manager'];
                            interactionManagerComp.writeInteraction(this.el, 'component', 'transform', this.orgMat);
                            this.orgMat = null;
                            if (this.data.emitEndEvent !== '')
                                this.el.emit(this.data.emitEndEvent);
                        }
                    }, 1000 / this.data.fps);
                }
            }
        }
    },
    startReverseAnimation: function () {
        this.orgMat = this.el.object3D.matrix.clone();
        if (this.data.duration > 0 && this.data.fps > 0) {
            let maxCnt = Math.floor(this.data.fps * this.data.duration / 1000);
            let cnt = maxCnt;
            if (maxCnt > 0) {
                if (this.loop === null) {
                    this.loop = setInterval(() => {
                        let t = cnt / maxCnt;
                        this.applyTransform(t);
                        --cnt;
                        if (cnt < 0) {
                            clearInterval(this.loop);
                            this.loop = null;
                            let interactionManagerComp = this.el.sceneEl.components['interaction-manager'];
                            interactionManagerComp.writeInteraction(this.el, 'component', 'transform', this.orgMat);
                            this.orgMat = null;
                            if (this.data.emitReverseEndEvent !== '')
                                this.el.emit(this.data.emitReverseEndEvent);
                        }
                    }, 1000 / this.data.fps);
                }
            }
        }
    },
    applyTransform: function (t) {
        THREE.Quaternion.slerp(this.startQuat, this.endQuat, this.el.object3D.quaternion, t);
        let tmp = this.op.clone().sub(new THREE.Vector3(this.data.startPivot.x, this.data.startPivot.y, this.data.startPivot.z).applyQuaternion(this.el.object3D.quaternion));
        this.el.object3D.position.copy(tmp);
        let interactionManagerComp = this.el.sceneEl.components['interaction-manager'];
        interactionManagerComp.writeInteraction(this.el, 'transform', 'total');
    }
});