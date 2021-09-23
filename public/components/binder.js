/**
 * This component makes this object appear to be mechanically linked with other specific objects.
 */

AFRAME.registerComponent('binder', {
    schema: {
        reference: {type: 'string'}, //CSS Selector
        property: {type: 'string', oneOf: ['position', 'rotation', 'scale']},//reference object's
        begin: {type: 'string'},
        end: {type: 'string'},
        pos1: {type: 'vec3'}, // this object's position when reference object's property value equal to begin
        pivot1: {type: 'vec3'}, // the pivot position vector of this object in the object coordinate system when the property value of the reference object is begin
        deltaPivot: {type: 'vec3'}, // the displacement vector of the pivot in the local coordinate system of the reference object while the property value of the reference object changes from begin to end
        rot1: {type: 'vec3'}, // the local euler angle of this object when the property value of the reference object is begin
        rot2: {type: 'vec3'}, // the local euler angle of this object when the property value of the reference object is end
        enableReversePos: {default: false}, // If enabledReversePos is true, deltaPivot becomes a displacement with respect to the midpoint, and the direction of motion is changed at that point, resulting in a reciprocating linear motion of the pivot in the local coordinate system.
        enableReverseRot: {default: false} //If enableReverseRot is true, rot2 becomes the euler angle with respect to the midpoint, and the direction of rotation is reversed at that point, resulting in a simple pendulum motion of the object.
    },

    init: function () {
        this.op1 = new THREE.Vector3();
        this.quat1 = new THREE.Quaternion();
        this.quat2 = new THREE.Quaternion();
        this.referenceEl = null;
    },
  
    update: function (oldData) {
        if(this.data.reference !== '') {
            this.referenceEl = document.querySelector(this.data.reference);
        }
        this.op1.addVectors(this.data.pos1, this.data.pivot1);
        this.quat1.setFromEuler(new THREE.Euler(this.data.rot1.x * Math.PI / 180, this.data.rot1.y * Math.PI / 180, this.data.rot1.z * Math.PI / 180, this.el.object3D.rotation.order));
        this.quat2.setFromEuler(new THREE.Euler(this.data.rot2.x * Math.PI / 180, this.data.rot2.y * Math.PI / 180, this.data.rot2.z * Math.PI / 180, this.el.object3D.rotation.order));
    },
  
    play: function() {
    },
  
    pause: function() {
    },
  
    tick: function () {
        if(this.referenceEl) {
            let startStat = AFRAME.utils.coordinates.parse(this.data.begin);
            let endStat = AFRAME.utils.coordinates.parse(this.data.end);
            let epsilon = 0.0001;
            let thisStat = new THREE.Vector3();
            if(this.data.property === 'position') {
                thisStat.copy(this.referenceEl.object3D.position);
            }
            else if(this.data.property === 'rotation') {
               thisStat.copy(this.referenceEl.object3D.rotation);
               thisStat.multiplyScalar(180 / Math.PI);
            }
            else if(this.data.property === 'scale') {
               thisStat.copy(this.referenceEl.object3D.scale);
            }
            let kx = (thisStat.x - startStat.x) / (endStat.x - startStat.x);
            let ky = (thisStat.y - startStat.y) / (endStat.y - startStat.y);
            let kz = (thisStat.z - startStat.z) / (endStat.z - startStat.z);
            if(isNaN(kx) && isNaN(ky) && isNaN(kz))
                return;
            let kArr = [];
            if(!isNaN(kx)) kArr.push(kx);
            if(!isNaN(ky)) kArr.push(ky);
            if(!isNaN(kz)) kArr.push(kz);
            let kMax = kArr[0], kMin = kArr[0];
            for(let k of kArr) {
                if(k > kMax) kMax = k;
                else if(k < kMin) kMin = k;
            }
            if(kMax > 1 || kMin < 0)
                return;
            if(Math.abs(kMax - kMin) <= epsilon)
                this.applyTransform(kMax);
        }
        else {
            if(this.data.reference !== '') {
                this.referenceEl = document.querySelector(this.data.reference);
            }
        }
    },
  
    remove: function () {
    },
    
    applyTransform: function (t) {
        let rotT = t, posT = t;
        if(this.data.enableReverseRot)
            rotT = t <= 0.5 ? 2 * t : 2 - 2 * t;
        if(this.data.enableReversePos)
            posT = t <= 0.5 ? 2 * t : 2 - 2 * t;
        
        THREE.Quaternion.slerp(this.quat1, this.quat2, this.el.object3D.quaternion, rotT);

        let tmp = this.op1.clone().add(new THREE.Vector3(this.data.deltaPivot.x, this.data.deltaPivot.y, this.data.deltaPivot.z).multiplyScalar(posT));
        tmp.sub(new THREE.Vector3(this.data.pivot1.x, this.data.pivot1.y, this.data.pivot1.z).applyQuaternion(this.el.object3D.quaternion));
        this.el.object3D.position.copy(tmp);
    }
});
