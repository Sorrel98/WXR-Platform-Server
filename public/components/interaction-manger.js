/**
 * This component attached to the a-scene object only.
 * It receives all interactions for the scene from the three interaction modes (3D, VR, AR),
 * records local work history, and delivers interaction information to the sync component.
 */
AFRAME.registerComponent('interaction-manager', {
    schema: {},
    init: function () {
        this.interactionMode = 0; //0:3D, 1:VR, 2:AR
        let backwardStack = new stack(65535);
        let forwardStack = new stack(65535);

        let onEnter3D = () => {
            if (this.interactionMode !== 0) {
                this.interactionMode = 0;
                let syncComp = this.el.components['sync'];
                if (syncComp) {
                    syncComp.writeInteractionModeChange(0);
                }
            }
        };
        onEnter3D = onEnter3D.bind(this);

        let onEnterVR = () => {
            if (this.interactionMode !== 1) {
                this.interactionMode = 1;
                let syncComp = this.el.components['sync'];
                if (syncComp) {
                    syncComp.writeInteractionModeChange(1);
                }
            }
        };
        onEnterVR = onEnterVR.bind(this);

        let onEnterAR = () => {
            if (this.interactionMode !== 2) {
                this.interactionMode = 2;
                let syncComp = this.el.components['sync'];
                if (syncComp) {
                    syncComp.writeInteractionModeChange(2);
                }
            }
        };
        onEnterAr = onEnterAR.bind(this);

        /**
         * Stringify the data of components with multiple properties.
         * The parameter is bound to [some element].components[any component name].data.
         */
        let stringifyMultiPropComponent = (componentData) => {
            let ret = '';
            if ('' + componentData === '[object Object]') {
                for (let prop in componentData) {
                    let tmp = '';
                    if (componentData[prop] === undefined) continue;
                    tmp += prop + ':';
                    if (componentData[prop] && '' + componentData[prop] === '[object Object]') {
                        for (let innerProp in componentData[prop]) {
                            tmp += componentData[prop][innerProp] + ' ';
                        }
                    }
                    else {
                        tmp += componentData[prop];
                    }
                    tmp.trim();
                    if (tmp.endsWith(':'))
                        continue;
                    tmp += ';';
                    ret += tmp;
                }
            }
            else {
                ret = componentData;
            }
            return ret;
        };

        /**
         * Perform undo or redo for local works.
         * It receives two stacks as parameters. 
         * It treats the first parameter as bacwardStack and the second parameter as forwardStack.
         * If you want to redo, you can change the order of the arguments.
         */
        let _undo = (backwardStack, forwardStack, noSync) => {
            if (backwardStack.empty()) return;
            let tdModeControlsComp = this.el.components['thd-mode-controls'];
            let syncComp = noSync ? null : this.el.components['sync'];
            let taskHistory = backwardStack.top();
            let redoTask = {};
            let targetEl = null;
            backwardStack.pop();
            switch (taskHistory.type) {
                case 'component':
                    targetEl = taskHistory.targetEl;
                    if (!targetEl) break;
                    redoTask = { type: 'component', targetEl: targetEl, detail: [] };
                    for (let data of taskHistory.detail) {
                        let comp = data.componentName;
                        let prevVal = data.prevVal;
                        var val = targetEl.getAttribute(comp);
                        if (comp === 'position' || comp === 'rotation' || comp === 'scale') {
                            val = AFRAME.utils.coordinates.stringify(val);
                            targetEl.setAttribute(comp, prevVal);
                        }
                        else {
                            if (val && targetEl.components[comp])
                                val = stringifyMultiPropComponent(targetEl.components[comp].data);
                            if (prevVal !== null) {
                                targetEl.setAttribute(comp, prevVal);
                            }
                            else {
                                targetEl.removeAttribute(comp);
                            }
                        }
                        if (syncComp) {
                            syncComp.writeComponent(targetEl, comp);
                        }
                        redoTask.detail.push({ componentName: comp, prevVal: val });
                    }
                    forwardStack.push(redoTask);
                    break;
                case 'added':
                    targetEl = taskHistory.targetEl;
                    if (!targetEl) break;
                    redoTask = { type: 'removeChild', parentEl: targetEl.parentElement, id: targetEl.id, tag: targetEl.tagName, components: [] };
                    if (targetEl.isAssetItem) {
                        redoTask.components.push({ componentName: 'src', prevVal: targetEl.getAttribute('src') });
                        targetEl.parentElement.emit('child-detached', { el: targetEl }, true);
                        targetEl.parentElement.removeChild(targetEl);
                    }
                    else {
                        if (targetEl.components) {
                            for (let key in targetEl.components) {
                                redoTask.components.push({ componentName: key, prevVal: stringifyMultiPropComponent(targetEl.components[key].data) });
                            }
                            redoTask.components.push({ componentName: 'position', prevVal: AFRAME.utils.coordinates.stringify(targetEl.getAttribute('position')) });
                            redoTask.components.push({ componentName: 'rotation', prevVal: AFRAME.utils.coordinates.stringify(targetEl.getAttribute('rotation')) });
                            redoTask.components.push({ componentName: 'scale', prevVal: AFRAME.utils.coordinates.stringify(targetEl.getAttribute('scale')) });
                        }
                        else {
                            for (let key of target.getAttributeNames()) {
                                if (key === 'id') continue;
                                redoTask.components.push({ componentName: key, prevVal: targetEl.getAttribute(key) });
                            }
                        }
                        if (targetEl.object3D !== undefined && tdModeControlsComp.transformControls.object === targetEl.object3D)
                            tdModeControlsComp.transformControls.detach();
                        targetEl.parentEl.removeChild(targetEl);
                        if (syncComp) {
                            syncComp.writeObject(targetEl, false);
                        }
                        targetEl.destroy();
                    }
                    forwardStack.push(redoTask);
                    break;
                case 'removeChild':
                    let parentEl = taskHistory.parentEl;
                    if (!parentEl) break;
                    if (document.querySelector('#' + taskHistory.id)) break;
                    let newEl = document.createElement(taskHistory.tag);
                    newEl.setAttribute('id', taskHistory.id);
                    parentEl.appendChild(newEl);
                    if (parentEl.tagName !== 'A-ASSETS' && syncComp) {
                        syncComp.writeObject(newEl, true);
                    }
                    if (newEl.hasLoaded) {
                        if (parentEl.tagName !== 'A-ASSETS') {
                            tdModeControlsComp.transformControls.attach(newEl.object3D);
                            tdModeControlsComp.el.emit('target-attached', { el: newEl }, false);
                        }
                        else
                            parent.emit('child-attached', { el: newEl }, true);
                        for (let data of taskHistory.components) {
                            newEl.setAttribute(data.componentName, data.prevVal);
                            if (syncComp) {
                                syncComp.writeComponent(newEl, data.componentName);
                            }
                        }
                        forwardStack.push({ type: 'added', targetEl: newEl });
                    }
                    else {
                        newEl.addEventListener('loaded', (e) => {
                            if (parentEl.tagName !== 'A-ASSETS') {
                                tdModeControlsComp.transformControls.attach(newEl.object3D);
                                tdModeControlsComp.el.emit('target-attached', { el: newEl }, false);
                            }
                            else
                                parent.emit('child-attached', { el: newEl }, true);
                            for (let data of taskHistory.components) {
                                newEl.setAttribute(data.componentName, data.prevVal);
                                if (syncComp) {
                                    syncComp.writeComponent(newEl, data.componentName);
                                }
                            }
                            forwardStack.push({ type: 'added', targetEl: newEl });
                        });
                    }
                    break;
                case 'hierarchyChange':
                    targetEl = taskHistory.targetEl;
                    let newParentEl = taskHistory.prevParent;
                    if (!targetEl || !newParentEl) break;
                    redoTask = { type: 'hierarchyChange', targetEl: targetEl, prevParent: targetEl.parentElement };

                    let targetObject = targetEl.object3D;
                    let newMat = (new THREE.Matrix4()).copy(newParentEl.object3D.matrixWorld).invert();
                    newMat.multiply(targetObject.matrixWorld);

                    let tdModeControlsComp = this.el.components['thd-mode-controls'];
                    if (tdModeControlsComp) {
                        tdModeControlsComp.hierarchyChange(targetEl, newParentEl);
                    }

                    if (syncComp) {
                        syncComp.writeHierarchyChange(targetEl);
                    }

                    forwardStack.push(redoTask);
            }
        };

        //Interface function to perform undo
        this.undo = () => {
            _undo(backwardStack, forwardStack);
        };

        //Interface function to perform redo
        this.redo = () => {
            _undo(forwardStack, backwardStack);
        };

        this.writeVRHandGesture = (handSide, gesture) => {
            if (this.interactionMode !== 1) return;
            let syncComp = this.el.components['sync'];
            if (syncComp) {
                syncComp.writeVRHandGesture(handSide, gesture);
            }
        };

        this.writeVRHandTransform = (leftHandMatrix, rightHandMatrix) => {
            if (this.interactionMode !== 1) return;
            let syncComp = this.el.components['sync'];
            if (syncComp) {
                syncComp.writeVRHandTransform(leftHandMatrix, rightHandMatrix);
            }
        };

        //Record work history and relay to sync component.
        this.writeInteraction = (targetEl, method, arg1, arg2) => {
            let syncComp = this.el.components['sync'];
            let work = null;
            switch (method) {
                case 'object':
                    switch (arg1) {
                        case 'created':
                            work = { type: 'added', targetEl: targetEl };
                            backwardStack.push(work);
                            forwardStack.clear();
                            if (syncComp) {
                                syncComp.writeObject(targetEl, true).catch(() => {
                                    if (backwardStack.top() == work) {
                                        _undo(backwardStack, new stack(1), true);
                                    }
                                    else {
                                        location.reload();
                                    }
                                });
                            }
                            break;
                        case 'deleted':
                            work = { type: 'removeChild', parentEl: targetEl.parentElement, id: targetEl.id, tag: targetEl.tagName, components: [] };
                            if (targetEl.isAssetItem) {
                                work.components.push({ componentName: 'src', prevVal: targetEl.getAttribute('src') });
                                targetEl.parentElement.emit('child-detached', { el: targetEl }, true);
                                targerEl.parentElement.removeChild(targetEl);
                            }
                            else {
                                if (targetEl.components) {
                                    for (let key in targetEl.components) {
                                        work.components.push({ componentName: key, prevVal: stringifyMultiPropComponent(targetEl.components[key].data) });
                                    }
                                    work.components.push({ componentName: 'position', prevVal: AFRAME.utils.coordinates.stringify(targetEl.getAttribute('position')) });
                                    work.components.push({ componentName: 'rotation', prevVal: AFRAME.utils.coordinates.stringify(targetEl.getAttribute('rotation')) });
                                    work.components.push({ componentName: 'scale', prevVal: AFRAME.utils.coordinates.stringify(targetEl.getAttribute('scale')) });
                                }
                                else {
                                    for (let key in targetEl.getAttributeNames()) {
                                        if (key === 'id') continue;
                                        work.components.push({ componentName: key, prevVal: targetEl.getAttribute(key) });
                                    }
                                }
                                targetEl.parentElement.removeChild(targetEl);
                                if (syncComp) {
                                    syncComp.writeObject(targetEl, false).catch(() => {
                                        if (backwardStack.top() == work) {
                                            _undo(backwardStack, new stack(1), true);
                                        }
                                        else {
                                            location.reload();
                                        }
                                    });
                                }
                                targetEl.destroy();
                            }
                            backwardStack.push(work);
                            forwardStack.clear();
                            break;
                    }
                    break;
                case 'hierarchy':
                    work = { type: 'hierarchyChange', targetEl: targetEl, prevParent: arg1 };
                    backwardStack.push(work);
                    forwardStack.clear();
                    if (syncComp) {
                        syncComp.writeHierarchyChange(targetEl).catch(() => {
                            if (backwardStack.top() == work) {
                                _undo(backwardStack, new stack(1), true);
                            }
                            else {
                                location.reload();
                            }
                        });
                    }
                    break;
                case 'component':
                    switch (arg1) {
                        case 'translate':
                            work = { type: 'component', targetEl: targetEl, detail: [{ componentName: 'position', prevVal: arg2 }] };
                            backwardStack.push(work);
                            forwardStack.clear();
                            targetEl.setAttribute('position', AFRAME.utils.coordinates.stringify(targetEl.getAttribute('position')));
                            if (syncComp) {
                                syncComp.writeComponent(targetEl, 'position').catch(() => {
                                    if (backwardStack.top() == work) {
                                        _undo(backwardStack, new stack(1), true);
                                    }
                                    else {
                                        location.reload();
                                    }
                                });
                            }
                            break;
                        case 'rotate':
                            work = { type: 'component', targetEl: targetEl, detail: [{ componentName: 'rotation', prevVal: arg2 }] };
                            backwardStack.push(work);
                            forwardStack.clear();
                            targetEl.setAttribute('rotation', AFRAME.utils.coordinates.stringify(targetEl.getAttribute('rotation')));
                            if (syncComp) {
                                syncComp.writeComponent(targetEl, 'rotation').catch(() => {
                                    if (backwardStack.top() == work) {
                                        _undo(backwardStack, new stack(1), true);
                                    }
                                    else {
                                        location.reload();
                                    }
                                });
                            }
                            break;
                        case 'scale':
                            work = { type: 'component', targetEl: targetEl, detail: [{ componentName: 'scale', prevVal: arg2 }] };
                            backwardStack.push(work);
                            forwardStack.clear();
                            targetEl.setAttribute('scale', AFRAME.utils.coordinates.stringify(targetEl.getAttribute('scale')));
                            if (syncComp) {
                                syncComp.writeComponent(targetEl, 'scale').catch(() => {
                                    if (backwardStack.top() == work) {
                                        _undo(backwardStack, new stack(1), true);
                                    }
                                    else {
                                        location.reload();
                                    }
                                });
                            }
                            break;
                        case 'transform':
                            let pos = new THREE.Vector3();
                            let quat = new THREE.Quaternion();
                            let scl = new THREE.Vector3();
                            arg2.decompose(pos, quat, scl);
                            let rot = new THREE.Euler();
                            rot.setFromQuaternion(quat, targetEl.object3D.rotation.order);
                            rot = rot.toVector3().multiplyScalar(180 / Math.PI);
                            work = { type: 'component', targetEl: targetEl, detail: [{ componentName: 'position', prevVal: AFRAME.utils.coordinates.stringify(pos) }, { componentName: 'rotation', prevVal: AFRAME.utils.coordinates.stringify(rot) }, { componentName: 'scale', prevVal: AFRAME.utils.coordinates.stringify(scl) }] };
                            backwardStack.push(work);
                            forwardStack.clear();
                            targetEl.setAttribute('position', AFRAME.utils.coordinates.stringify(targetEl.getAttribute('position')));
                            targetEl.setAttribute('rotation', AFRAME.utils.coordinates.stringify(targetEl.getAttribute('rotation')));
                            targetEl.setAttribute('scale', AFRAME.utils.coordinates.stringify(targetEl.getAttribute('scale')));
                            if (syncComp) {
                                let promises = [];
                                promises.push(syncComp.writeComponent(targetEl, 'position'));
                                promises.push(syncComp.writeComponent(targetEl, 'rotation'));
                                promises.push(syncComp.writeComponent(targetEl, 'scale'));
                                Promise.allSettled(promises).then((results) => {
                                    let Rejected = false;
                                    results.forEach((result) => { if (result.status === 'rejected') Rejected = true; });
                                    if (Rejected) {
                                        if (backwardStack.top() == work) {
                                            _undo(backwardStack, new stack(1), true);
                                        }
                                        else {
                                            location.reload();
                                        }
                                    }
                                });
                            }
                            break;
                        case 'total':
                            if (arg2.length > 0) {
                                work = { type: 'component', targetEl: targetEl, detail: arg2 };
                                backwardStack.push(work);
                                forwardStack.clear();
                                if (syncComp) {
                                    let promises = [];
                                    if (targetEl.components !== undefined) {
                                        for (let dt of arg2)
                                            promises.push(syncComp.writeComponent(targetEl, dt.componentName));
                                    }
                                    Promise.allSettled(promises).then((results) => {
                                        let Rejected = false;
                                        results.forEach((result) => { if (result.status === 'rejected') Rejected = true; });
                                        if (Rejected) {
                                            if (backwardStack.top() == work) {
                                                _undo(backwardStack, new stack(1), true);
                                            }
                                            else {
                                                location.reload();
                                            }
                                        }
                                    });
                                }
                            }
                            break;
                        case 'add':
                            work = { type: 'component', targetEl: targetEl, detail: [arg2] };
                            backwardStack.push(work);
                            forwardStack.clear();
                            if (targetEl.getAttribute(arg2.componentName)) {
                                if (syncComp) {
                                    syncComp.writeComponent(targetEl, arg2.componentName).catch(() => {
                                        if (backwardStack.top() == work) {
                                            _undo(backwardStack, new stack(1), true);
                                        }
                                        else {
                                            location.reload();
                                        }
                                    });
                                }
                            }
                            else {
                                _undo(backwardStack, new stack(1), true);
                            }
                            break;
                        case 'remove':
                            work = { type: 'component', targetEl: targetEl, detail: [arg2] };
                            backwardStack.push(work);
                            forwardStack.clear();
                            if (syncComp) {
                                syncComp.writeComponent(targetEl, arg2.componentName).catch(() => {
                                    if (backwardStack.top() == work) {
                                        _undo(backwardStack, new stack(1), true);
                                    }
                                    else {
                                        location.reload();
                                    }
                                });
                            }
                            break;
                    }
                    break;
                case 'transform':
                    targetEl.emit('transformChanged', { type: arg1 }, true);
                    if (syncComp) {
                        syncComp.writeTransform(targetEl);
                    }
                    break;
            }
        };

        this.el.addEventListener('enter-ar', onEnterAR, false);
        this.el.addEventListener('exit-ar', onEnter3D, false);
        this.el.addEventListener('enter-vr', onEnterVR, false);
        this.el.addEventListener('exit-vr', onEnter3D, false);

    },
    play: function () {
    },
    pause: function () {
    },
    remove: function () {
    }
});