/**
 * This component supports 3D interaction through gizmo and UI on canvas.
 * In addition to manipulating transforms, 
 * you can perform detailed operations such as changing scene hierarchies and setting objects' components.
 */
AFRAME.registerComponent('thd-mode-controls', {
    dependencies: ['interaction-manager'],

    init: function () {
        if (this.el.sceneEl !== this.el) return;
        let tdModeControlsComp = this;
        let interactionManagerComp = this.el.components['interaction-manager'];
        this.enableKeyEvent = true;
        this.ctrlPushed = false;
        this.shiftPushed = false;

        /**
         * Depending on the selected tab, the selected target in the Hierarchy View or Flag View will be deleted from the scene.
         * @returns undefined
         */
        this._delete = () => {
            let target;
            if (tdModeControlsComp.leftSideMultiTab.selected === 0) {
                target = tdModeControlsComp.HierarchyView.getSelectedEl();
                if (target === null) return;
                if (target === target.sceneEl || target.id === '' || target.tagName.toLowerCase() === 'a-user')
                    return;
                if (target.object3D !== undefined && tdModeControlsComp.transformControls.object === target.object3D)
                    tdModeControlsComp.transformControls.detach();
            }
            else if (tdModeControlsComp.leftSideMultiTab.selected === 2) {
                target = tdModeControlsComp.FlagView.getSelectedEl();
                if (target === null) return;
            }
            interactionManagerComp.writeInteraction(target, 'object', 'deleted');
        };

        /**
         * Stringify the data of components with multiple properties.
         * The parameter is bound to [some element].components[any component name].data.
         * @returns string
         */
        this._stringifyMultiPropComponent = function (componentData) {
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
         * Stringify the scene to create the content source.
         * @returns string
         */
        this._stringifyContent = () => {
            const sceneEl = tdModeControlsComp.el;
            let dataStr = '';
            const makeStr = (el) => {
                if (el.tagName.toLowerCase() === 'a-user') return false;
                let thisStr = '<';
                thisStr += el.tagName.toLowerCase();
                if (el.id) {
                    thisStr += ' id="' + el.id + '"';
                }
                if (el.components) {
                    if (el.components['camera']) return false;
                    if (el.tagName !== 'A-TRIGGER' && el.tagName !== 'A-FLAG') {
                        thisStr += ' visible="' + el.getAttribute('visible') + '"';
                        thisStr += ' position="' + AFRAME.utils.coordinates.stringify(el.getAttribute('position')) + '"';
                        thisStr += ' rotation="' + AFRAME.utils.coordinates.stringify(el.getAttribute('rotation')) + '"';
                        thisStr += ' scale="' + AFRAME.utils.coordinates.stringify(el.getAttribute('scale')) + '"';
                    }
                    for (let comp in el.components) {
                        if (comp === 'visible' || comp === 'position' || comp === 'rotation' || comp === 'scale')
                            continue;
                        thisStr += ' ' + comp + '="' + tdModeControlsComp._stringifyMultiPropComponent(el.components[comp].data) + '"';
                    }
                }
                else {
                    for (let attr of el.getAttributeNames()) {
                        if (attr === 'id') continue;
                        thisStr += ' ' + attr + '="' + el.getAttribute(attr) + '"';
                    }
                }
                thisStr += '>';
                dataStr += thisStr;
                for (let child of el.children) {
                    if (!makeStr(child)) {
                        dataStr = dataStr.substring(0, dataStr.lastIndexOf('<'));
                        return true;
                    }
                }
                dataStr += '</' + el.tagName.toLowerCase() + '>';
                return true;
            };

            for (let child of sceneEl.children) {
                if (child.tagName.startsWith('A-')) {
                    makeStr(child);
                }
            }
            return dataStr;
        };

        this._saveContent = () => {
            const sceneEl = tdModeControlsComp.el;
            let contentStr = tdModeControlsComp._stringifyContent();
            let vrOptions = JSON.stringify(sceneEl.components['vr-mode-controls'].data);
            vrOptions = vrOptions.substring(2, vrOptions.length - 1).replaceAll('"', '').replaceAll(',', ';');
            sceneEl.components.screenshot.data.width = 128;
            sceneEl.components.screenshot.data.height = 96;

            let imageURL = sceneEl.components.screenshot.getCanvas('perspective').toDataURL();

            $.ajax({
                url: '/save',
                type: 'POST',
                data: {
                    wid: wid,
                    content: contentStr,
                    vroptions: vrOptions,
                    screenshot: imageURL
                },
                success: (result) => {
                    console.log('success to save');
                    alert("Workspace is saved");
                },
                error: (err) => {
                    console.log(err);
                }
            });
        };

        this._savePCD = () => {
            const sceneEl = tdModeControlsComp.el;
            sceneEl.components.screenshot.data.width = 128;
            sceneEl.components.screenshot.data.height = 96;
            let wid = window.wid;
            let newid = document.querySelector('#PCD_id').value;
            let pcd_position = document.querySelector('#pcd').object3D.children[0].geometry.attributes.position;
            let pcd_color = document.querySelector('#pcd').object3D.children[0].geometry.attributes.color;
            let width = pcd_position.count;

            function roundToSix(num) {
                return +(Math.round(num + "e+5") + "e-5");
            }

            let data = `# .PCD v.7 - Point Cloud Data file format\nVERSION .7\nFIELDS x y z rgb\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH ${width}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS ${width}\nDATA ascii\n`;

            let r = 0;
            let g = 0;
            let b = 0;
            for (i = 0; i < width * 3; i++) {
                data = data.concat(String(roundToSix(pcd_position.array[i])));
                data = data + " ";
                if (i % 3 == 0) {
                    r = (pcd_color.array[i]) * 255;
                }
                else if (i % 3 == 1) {
                    g = (pcd_color.array[i]) * 255;
                }
                else {
                    b = (pcd_color.array[i]) * 255;
                    rgb = Math.floor((r + g / 256 + b / (256 * 256)) * 256 * 256).toPrecision(7);
                    if (i != width * 3 - 1) {
                        data = data.concat(String(rgb) + "\n");
                    }
                    else {
                        data = data.concat(String(rgb));
                    }
                }
            }

            $.ajax({
                url: '/savePCD',
                type: 'POST',
                traditional: true,
                data: {
                    wid: wid,
                    astName: newid,
                    data: data
                },
                success: (result) => {
                    alert("Success : PCD file is saved to asset manager");
                },
                error: (err) => {
                    console.log(err);
                }
            });
        };

        /**
         * Toggles the reference coordinate system of the gizmo between world coordinate system and local coordinate system.
         */
        this._toggleSpace = () => {
            tdModeControlsComp.transformControls.setSpace(tdModeControlsComp.transformControls.space === "local" ? "world" : "local");
            if (tdModeControlsComp.transformControls.space === 'local')
                tdModeControlsComp.coordinatesButton.setAttribute('src', '/img/icon/cube in circle.svg');
            else
                tdModeControlsComp.coordinatesButton.setAttribute('src', '/img/icon/earth in circle.svg');
        };

        /**
         * Switch the control mode of the gizmo to translate.
         */
        this._setModeTranslate = () => {
            tdModeControlsComp.transformControls.setMode('translate');
            tdModeControlsComp.translateButton.setAttribute('src', '/img/icon/position in circle_active.svg');
            tdModeControlsComp.rotateButton.setAttribute('src', '/img/icon/rotation in circle_inactive.svg');
            tdModeControlsComp.scaleButton.setAttribute('src', '/img/icon/scale in circle_inactive.svg');
        };

        /**
        * Switch the control mode of the gizmo to rotate.
        */
        this._setModeRotate = () => {
            tdModeControlsComp.transformControls.setMode("rotate");
            tdModeControlsComp.translateButton.setAttribute('src', '/img/icon/position in circle_inactive.svg');
            tdModeControlsComp.rotateButton.setAttribute('src', '/img/icon/rotation in circle_active.svg');
            tdModeControlsComp.scaleButton.setAttribute('src', '/img/icon/scale in circle_inactive.svg');
        };

        /**
        * Switch the control mode of the gizmo to scale.
        */
        this._setModeScale = () => {
            tdModeControlsComp.transformControls.setMode("scale");
            tdModeControlsComp.translateButton.setAttribute('src', '/img/icon/position in circle_inactive.svg');
            tdModeControlsComp.rotateButton.setAttribute('src', '/img/icon/rotation in circle_inactive.svg');
            tdModeControlsComp.scaleButton.setAttribute('src', '/img/icon/scale in circle_active.svg');
        };

        this.initTransformControls();
        this.initInsertWindow();
        this.initPCDwindow();
        this.initEditWindow();
        this.initleftSideWindow();
        this.initHelpWindow();
        this.initSessionListWindow();
        this.initUILayer();

        window.addEventListener('keydown', (event) => {
            if (!tdModeControlsComp.enableKeyEvent) return;
            if (event.defaultPrevented) return;
            if (event.key === "Shift") {
                tdModeControlsComp.shiftPushed = true;
                return;
            }
            else if (event.key === "Control") {
                tdModeControlsComp.ctrlPushed = true;
                return;
            }
            else if (event.key === "?") {
                tdModeControlsComp.loadHelper();
            }
            else if (event.key === "Insert" || (tdModeControlsComp.ctrlPushed && (event.key === "i" || event.key === "I"))) {
                tdModeControlsComp.loadInsertWindow();
                return;
            }
            else if (event.key === "Enter") {
                let selectedEl;
                if (tdModeControlsComp.leftSideMultiTab.selected === 0)
                    selectedEl = tdModeControlsComp.HierarchyView.getSelectedEl();
                else if (tdModeControlsComp.leftSideMultiTab.selected === 2)
                    selectedEl = tdModeControlsComp.FlagView.getSelectedEl();
                if (selectedEl !== null)
                    tdModeControlsComp.loadEditor(selectedEl);
                return;
            }
            else if (event.key === "Delete" || (tdModeControlsComp.ctrlPushed && (event.key === "d" || event.key === "D"))) {// delete
                tdModeControlsComp._delete();
                return;
            }
            else if (event.key === "h" || event.key === "H") {
                let wasdControls = document.querySelector('[wasd-controls]').components['wasd-controls'];
                wasdControls.data.fly = !wasdControls.data.fly;
                return;
            }
            else if (event.key === "u" || event.key === "U") {
                tdModeControlsComp.toggleUIDisplay();
                return;
            }
            else if (tdModeControlsComp.ctrlPushed && (event.key === "s" || event.key === "S")) {
                tdModeControlsComp._saveContent();
            }
            else if (tdModeControlsComp.ctrlPushed && (event.key === "z" || event.key === "Z")) {
                if (tdModeControlsComp.shiftPushed)
                    interactionManagerComp.redo();
                else
                    interactionManagerComp.undo();
                return;
            }
            else if (event.key === "Escape") {
                if (tdModeControlsComp.leftSideMultiTab.selected === 0) {
                    if (tdModeControlsComp.transformControls.object) {
                        const oldTarget = tdModeControlsComp.transformControls.object;
                        tdModeControlsComp.transformControls.detach();
                        tdModeControlsComp.el.emit('target-detached', { el: oldTarget }, false);
                    }
                }
                else if (tdModeControlsComp.leftSideMultiTab.selected === 2) {
                    tdModeControlsComp.FlagView.deselect();
                }
            }
            else if (event.key === "." || event.key === ">") {
                let wasdControls = document.querySelector('[wasd-controls]').components['wasd-controls'];
                if (tdModeControlsComp.shiftPushed)
                    wasdControls.data.acceleration += 10;
                else
                    wasdControls.data.acceleration++;
                if (wasdControls.data.acceleration > 100)
                    wasdControls.data.acceleration = 100;
            }
            else if (event.key === "," || event.key === "<") {
                let wasdControls = document.querySelector('[wasd-controls]').components['wasd-controls'];
                if (tdModeControlsComp.shiftPushed)
                    wasdControls.data.acceleration -= 10;
                else
                    wasdControls.data.acceleration--;
                if (wasdControls.data.acceleration < 1)
                    wasdControls.data.acceleration = 1;
            }
            if (tdModeControlsComp.transformControls.object === undefined)
                return;
            switch (event.key) {
                case "q":
                case "Q":
                    tdModeControlsComp._toggleSpace();
                    break;
                case "t":
                case "T":
                    tdModeControlsComp._setModeTranslate();
                    break;
                case "r":
                case "R":
                    tdModeControlsComp._setModeRotate();
                    break;
                case "e":
                case "E":
                    tdModeControlsComp._setModeScale();
                    break;

                case "+":
                    tdModeControlsComp.transformControls.setSize(tdModeControlsComp.transformControls.size + 0.1);
                    break;

                case "-":
                    tdModeControlsComp.transformControls.setSize(Math.max(tdModeControlsComp.transformControls.size - 0.1, 0.1));
                    break;

                case "x":
                case "X":
                    tdModeControlsComp.transformControls.showX = !tdModeControlsComp.transformControls.showX;
                    break;

                case "y":
                case "Y":
                    tdModeControlsComp.transformControls.showY = !tdModeControlsComp.transformControls.showY;
                    break;

                case "z":
                case "Z":
                    tdModeControlsComp.transformControls.showZ = !tdModeControlsComp.transformControls.showZ;
                    break;

                case " ":
                    tdModeControlsComp.transformControls.enabled = !tdModeControlsComp.transformControls.enabled;
                    break;
            }
        });

        window.addEventListener('keyup', (event) => {
            switch (event.key) {
                case "Shift":
                    tdModeControlsComp.shiftPushed = false;
                    break;
                case "Control":
                    tdModeControlsComp.ctrlPushed = false;
                    break;
            }
        });
    },

    /**
     * Create a gizmo and register related event handlers.
     */
    initTransformControls: function () {
        let tdModeControlsComp = this;
        let interactionManagerComp = this.el.components['interaction-manager'];
        this.transformControls = new THREE.TransformControls(this.el.camera, this.el.renderer.domElement);
        this.el.object3D.add(this.transformControls);

        //When the pick target is changed
        this.transformControls.addEventListener('change', () => {
            tdModeControlsComp.el.renderer.render(tdModeControlsComp.el.object3D, tdModeControlsComp.el.camera);
        });

        //Occurs during manipulation via gizmos
        this.transformControls.addEventListener('dragging-changed', (event) => {
            document.querySelector('[look-controls]').getAttribute('look-controls').enabled = !event.value;
            document.querySelector('[look-controls]').getAttribute('look-controls').touchEnabled = !event.value;
            if (event.value) {
                switch (tdModeControlsComp.transformControls.mode) {
                    case 'translate':
                        tdModeControlsComp._orgTF = AFRAME.utils.coordinates.stringify(tdModeControlsComp.transformControls.object.el.getAttribute('position'));
                        break;
                    case 'rotate':
                        tdModeControlsComp._orgTF = AFRAME.utils.coordinates.stringify(tdModeControlsComp.transformControls.object.el.getAttribute('rotation'));
                        break;
                    case 'scale':
                        tdModeControlsComp._orgTF = AFRAME.utils.coordinates.stringify(tdModeControlsComp.transformControls.object.el.getAttribute('scale'));
                        break;
                }
            }
            else {
                interactionManagerComp.writeInteraction(tdModeControlsComp.transformControls.object.el, 'component', tdModeControlsComp.transformControls.mode, tdModeControlsComp._orgTF);
                tdModeControlsComp._orgTF = '';
            }
        });

        //Occurs when an operation through the gizmo ends
        this.transformControls.addEventListener('objectChange', (event) => {
            let targetEl = event.target.object.el;
            let mode = event.target.getMode();
            interactionManagerComp.writeInteraction(targetEl, 'transform', mode);
        });

        var raycaster = new THREE.Raycaster();
        var mouse = new THREE.Vector2();
        var onDownPosition = new THREE.Vector2();
        var onUpPosition = new THREE.Vector2();

        let getIntersects = (point, object3Ds) => {
            mouse.set((point.x * 2) - 1, -(point.y * 2) + 1);
            raycaster.setFromCamera(mouse, tdModeControlsComp.el.camera);
            return raycaster.intersectObjects(object3Ds, true);
        }

        let getMousePosition = (dom, x, y) => {
            let rect = dom.getBoundingClientRect();
            return [(x - rect.left) / rect.width, (y - rect.top) / rect.height];
        }

        //mouse(or touch) picking
        let handleClick = () => {
            if (onDownPosition.distanceTo(onUpPosition) === 0) {
                let objects = [];
                let entry = (obj, collidableAncestor) => {
                    let hasCollidable = obj.hasAttribute('collidable');
                    if (obj.object3DMap['mesh']) {
                        if (collidableAncestor || hasCollidable) {
                            objects.push(obj.object3DMap['mesh']);
                        }
                    }
                    for (let child of obj.getChildEntities()) {
                        entry(child, collidableAncestor || hasCollidable);
                    }
                };
                entry(tdModeControlsComp.el, false);

                let intersects = getIntersects(onUpPosition, objects);
                if (intersects.length > 0) {
                    const object = intersects[0].object;
                    let target = object.el;
                    for (; target !== target.sceneEl; target = target.parentEl) {
                        if (target.hasAttribute('collidable'))
                            break;
                    }
                    tdModeControlsComp.transformControls.attach(target.object3D);
                    tdModeControlsComp.el.emit('target-attached', { el: target }, false);
                } else { }
            }
        }

        this.onMouseDown = (event) => {
            event.preventDefault();
            let array = getMousePosition(tdModeControlsComp.el, event.clientX, event.clientY);
            onDownPosition.fromArray(array);
            document.addEventListener('mouseup', tdModeControlsComp.onMouseUp, false);
        };

        this.onMouseUp = (event) => {
            let array = getMousePosition(tdModeControlsComp.el, event.clientX, event.clientY);
            onUpPosition.fromArray(array);
            handleClick();
            document.removeEventListener('mouseup', tdModeControlsComp.onMouseUp, false);
        };

        this.onTouchStart = (event) => {
            let touch = event.changedTouches[0];
            let array = getMousePosition(tdModeControlsComp.el, touch.clientX, touch.clientY);
            onDownPosition.fromArray(array);
            document.addEventListener('touchend', tdModeControlsComp.onTouchEnd, false);
        };

        this.onTouchEnd = (event) => {
            let touch = event.changedTouches[0];
            let array = getMousePosition(tdModeControlsComp.el, touch.clientX, touch.clientY);
            onUpPosition.fromArray(array);
            handleClick();
            document.removeEventListener('touchend', tdModeControlsComp.onTouchEnd, false);
        };

        this.el.addEventListener('mousedown', this.onMouseDown, false);
        this.el.addEventListener('touchstart', this.onTouchStart, false);
    },

    /**
     * Initialize insertWindow to add new objects to the scene.
     */
    initInsertWindow: function () {
        let tdModeControlsComp = this;
        let interactionManagerComp = this.el.components['interaction-manager'];
        this.primitiveList = [];
        this.insertWindow = document.createElement('div');
        this.insertWindow.innerHTML = "<div><table><tr><td align = 'center'>id : </td><td colspan = '2'><input id='insert_id' type='text' style='width:200px'></td></tr><tr align = 'center'><td align = 'right'>primitive : </td><td colspan = '2'><select id='insert_primitive' style='width:204px'></select></td></tr></table><center><table style='border-spacing:30px 0px'><tr><td><button id='insert_ok' style='width:60px'>OK</button></td><td><button id='insert_cancel' style='width:60px'>Cancel</button></td></tr></table></center></div>";
        this.insertWindow.style.backgroundColor = 'lightblue';
        this.insertWindow.style.display = 'none';
        this.insertWindow.style.padding = '10px';
        this.insertWindow.style.position = 'fixed';
        this.insertWindow.style.width = '300px';
        this.insertWindow.style.height = '87px';
        this.insertWindow.style.left = '35%';
        this.insertWindow.style.top = '50%';
        $("body").prepend(this.insertWindow);

        let onResize = (e) => {
            tdModeControlsComp.insertWindow.style.left = '35%';
            tdModeControlsComp.insertWindow.style.top = '50%';
        };

        let onKeydown = (e) => {
            if (e.key === "Enter") {
                tdModeControlsComp.onInsertOK();
            }
            else if (e.key === "Escape") {
                tdModeControlsComp.onInsertCancel();
            }
        };

        this.insertWindowHandlerLoader = () => {
            window.addEventListener('resize', onResize);
            window.addEventListener('keydown', onKeydown);
        };

        this.insertWindowHandlerUnloader = () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('keydown', onKeydown);
        };

        this.onInsertCancel = (e) => {
            document.querySelector('#insert_id').value = "";
            document.querySelector('#insert_primitive').selectedIndex = 0;
            tdModeControlsComp.insertWindow.style.zIndex = '0';
            tdModeControlsComp.insertWindow.style.display = 'none';
            tdModeControlsComp.el.addEventListener('mousedown', tdModeControlsComp.onMouseDown, false);
            tdModeControlsComp.el.addEventListener('touchstart', tdModeControlsComp.onTouchStart, false);
            tdModeControlsComp.enableKeyEvent = true;
            const wasdControlsEl = document.querySelector('[wasd-controls]');
            if (wasdControlsEl !== null)
                wasdControlsEl.getAttribute('wasd-controls').enabled = true;
            document.activeElement.blur();
            tdModeControlsComp.leftSideMultiTab.activate = true;
            tdModeControlsComp.insertWindowHandlerUnloader();
        };

        this.onInsertOK = (e) => {
            const newid = document.querySelector('#insert_id').value;
            let primitives = document.querySelector('#insert_primitive');
            let parent;
            if (primitives.length === 0) {
                tdModeControlsComp.onInsertCancel();
                return;
            }
            let isFlag = tdModeControlsComp.leftSideMultiTab.selected === 2;
            if (isFlag) {
                parent = tdModeControlsComp.FlagView.getSelectedEl();
            }
            else {
                parent = tdModeControlsComp.HierarchyView.getSelectedEl();
            }
            if (!parent) {
                parent = tdModeControlsComp.el;
            }
            if (parent.tagName === 'A-FLAG') {
                tdModeControlsComp.onInsertCancel();
                return;
            }
            if (newid === '') {
                tdModeControlsComp.onInsertCancel();
                return;
            }
            if (document.querySelector('#' + newid) === null) {
                var newEl = document.createElement(primitives[primitives.selectedIndex].value);
                newEl.setAttribute('id', newid);
                if (!isFlag) {
                    newEl.setAttribute('visible', true);
                    newEl.setAttribute('position', { x: 0, y: 0, z: 0 });
                    newEl.setAttribute('rotation', { x: 0, y: 0, z: 0 });
                    newEl.setAttribute('scale', { x: 1, y: 1, z: 1 });
                }
                parent.appendChild(newEl);
                if (newEl.tagName === 'A-GLTF-MODEL') {
                    newEl.setAttribute('gltf-model', 'undefined'); //default component
                }
                if (newEl.hasLoaded) {
                    interactionManagerComp.writeInteraction(newEl, 'object', 'created');
                    if (!isFlag) {
                        tdModeControlsComp.transformControls.attach(newEl.object3D);
                        tdModeControlsComp.el.emit('target-attached', { el: newEl }, false);
                    }
                    else {
                        let num = tdModeControlsComp.FlagView.nodeNumByEl.get(newEl);
                        tdModeControlsComp.FlagView.select(num);
                    }
                    tdModeControlsComp.onInsertCancel();
                    tdModeControlsComp.loadEditor(newEl);
                }
                else {
                    newEl.addEventListener('loaded', () => {
                        interactionManagerComp.writeInteraction(newEl, 'object', 'created');
                        if (!isFlag) {
                            tdModeControlsComp.transformControls.attach(newEl.object3D);
                            tdModeControlsComp.el.emit('target-attached', { el: newEl }, false);
                        }
                        else {
                            let num = tdModeControlsComp.FlagView.nodeNumByEl.get(newEl);
                            tdModeControlsComp.FlagView.select(num);
                        }
                        tdModeControlsComp.onInsertCancel();
                        tdModeControlsComp.loadEditor(newEl);
                    });
                }

            } else {
                console.log('id duplicated!');
                if (!isFlag) {
                    tdModeControlsComp.transformControls.attach(document.querySelector('#' + newid).object3D);
                    tdModeControlsComp.el.emit('target-attached', { el: document.querySelector('#' + newid) }, false);
                }
                tdModeControlsComp.onInsertCancel();
            }
        };

        this.loadInsertWindow = () => {
            tdModeControlsComp.primitiveList = [];
            if (tdModeControlsComp.leftSideMultiTab.selected === 1) return;
            tdModeControlsComp.leftSideMultiTab.activate = false;
            if (tdModeControlsComp.leftSideMultiTab.selected === 0) {
                for (let prim in AFRAME.primitives.primitives) {
                    if (prim !== 'a-user' && prim !== 'a-flag' && prim !== 'a-trigger' && prim !== 'a-asset-item' && prim !== 'a-assets')
                        tdModeControlsComp.primitiveList.push(prim);
                }
            }
            else if (tdModeControlsComp.leftSideMultiTab.selected === 2) {
                tdModeControlsComp.primitiveList.push('a-flag');
                tdModeControlsComp.primitiveList.push('a-trigger');
            }

            const insertPrimitive = document.querySelector('#insert_primitive');
            insertPrimitive.innerHTML = '';

            for (let item of tdModeControlsComp.primitiveList) {
                insertPrimitive.innerHTML += "<option value='" + item + "'>" + item + "</option>";
            }

            tdModeControlsComp.insertWindow.style.zIndex = '10000';
            tdModeControlsComp.insertWindow.style.display = 'block';

            tdModeControlsComp.el.removeEventListener('mousedown', tdModeControlsComp.onMouseDown);
            tdModeControlsComp.el.removeEventListener('touchstart', tdModeControlsComp.onTouchStart);
            tdModeControlsComp.enableKeyEvent = false;
            const wasdControlsEl = document.querySelector('[wasd-controls]');
            if (wasdControlsEl !== null)
                wasdControlsEl.getAttribute('wasd-controls').enabled = false;
            tdModeControlsComp.insertWindowHandlerLoader();
        };

        document.querySelector('#insert_cancel').addEventListener('click', this.onInsertCancel);
        document.querySelector('#insert_ok').addEventListener('click', this.onInsertOK);
    },

    /**
     * Initializes PCDWindow for adding point cloud data to Asset DB
     */
    initPCDwindow: function () {
        let tdModeControlsComp = this;
        let interactionManagerComp = this.el.components['interaction-manager'];
        this.PCDWindow = document.createElement('div');
        this.PCDWindow.innerHTML = "<div><table><tr><td align = 'center'>File Name : </td><td colspan = '2'><input id='PCD_id' type='text' style='width:200px'></td></tr><tr align = 'center'></tr></table><center><table style='border-spacing:30px 0px'><tr><td><button id='PCD_ok' style='width:60px'>OK</button></td><td><button id='PCD_cancel' style='width:60px'>Cancel</button></td></tr></table></center></div>";
        this.PCDWindow.style.backgroundColor = 'lightblue';
        this.PCDWindow.style.display = 'none';
        this.PCDWindow.style.padding = '10px';
        this.PCDWindow.style.position = 'fixed';
        this.PCDWindow.style.width = '300px';
        this.PCDWindow.style.height = '55px';
        this.PCDWindow.style.left = '35%';
        this.PCDWindow.style.top = '50%';
        $("body").prepend(this.PCDWindow);

        let onResize = (e) => {
            tdModeControlsComp.PCDWindow.style.left = '35%';
            tdModeControlsComp.PCDWindow.style.top = '50%';
        };

        let onKeydown = (e) => {
            if (e.key === "Enter") {
                tdModeControlsComp.onPCDOK();
            }
            else if (e.key === "Escape") {
                tdModeControlsComp.onPCDCancel();
            }
        };

        this.PCDWindowHandlerLoader = () => {
            window.addEventListener('resize', onResize);
            window.addEventListener('keydown', onKeydown);
        };

        this.PCDWindowHandlerUnloader = () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('keydown', onKeydown);
        };

        this.onPCDCancel = (e) => {
            document.querySelector('#PCD_id').value = "";
            tdModeControlsComp.PCDWindow.style.zIndex = '0';
            tdModeControlsComp.PCDWindow.style.display = 'none';
            tdModeControlsComp.el.addEventListener('mousedown', tdModeControlsComp.onMouseDown, false);
            tdModeControlsComp.el.addEventListener('touchstart', tdModeControlsComp.onTouchStart, false);
            tdModeControlsComp.enableKeyEvent = true;
            const wasdControlsEl = document.querySelector('[wasd-controls]');
            if (wasdControlsEl !== null)
                wasdControlsEl.getAttribute('wasd-controls').enabled = true;
            document.activeElement.blur();
            tdModeControlsComp.leftSideMultiTab.activate = true;
            tdModeControlsComp.PCDWindowHandlerUnloader();
        };

        this.onPCDOK = (e) => {
            const newid = document.querySelector('#PCD_id').value;
            if (newid === '') {
                tdModeControlsComp.onPCDCancel();
                return;
            }
            if (document.querySelector('#' + newid) === null) {
                this._savePCD();
                tdModeControlsComp.onPCDCancel();
            } else {
                console.log('id duplicated!');
                if (!isFlag) {
                    tdModeControlsComp.transformControls.attach(document.querySelector('#' + newid).object3D);
                    tdModeControlsComp.el.emit('target-attached', { el: document.querySelector('#' + newid) }, false);
                }
                tdModeControlsComp.onPCDCancel();
            }
        };

        this.loadPCDWindow = () => {

            tdModeControlsComp.PCDWindow.style.zIndex = '10000';
            tdModeControlsComp.PCDWindow.style.display = 'block';

            tdModeControlsComp.el.removeEventListener('mousedown', tdModeControlsComp.onMouseDown);
            tdModeControlsComp.el.removeEventListener('touchstart', tdModeControlsComp.onTouchStart);
            tdModeControlsComp.enableKeyEvent = false;
            const wasdControlsEl = document.querySelector('[wasd-controls]');
            if (wasdControlsEl !== null)
                wasdControlsEl.getAttribute('wasd-controls').enabled = false;
            tdModeControlsComp.PCDWindowHandlerLoader();
        };

        document.querySelector('#PCD_cancel').addEventListener('click', this.onPCDCancel);
        document.querySelector('#PCD_ok').addEventListener('click', this.onPCDOK);
    },

    /**
     * Initializes editWindow for adding/deleting components to elements or editing component property values.
     */
    initEditWindow: function () {
        let tdModeControlsComp = this;
        let interactionManagerComp = this.el.components['interaction-manager'];
        this.editWindow = document.createElement('div');
        this.editWindow.innerHTML = "<div id='edit_panel' style='overflow:auto; height: calc(94% - 32px); margin:2%'></div>" +
            "<div style='text-align:right; height:22px; margin:2%;'>" +
            "<button id='edit_ok'>OK</button><button id='edit_cancel'>Cancel</button></div>";
        this.editWindow.style.backgroundColor = 'lightblue';
        this.editWindow.style.display = 'none';
        this.editWindow.style.position = 'fixed';
        this.editWindow.style.width = '80%';
        this.editWindow.style.height = 'calc(80% + 30px)';
        this.editWindow.style.maxWidth = '600px';
        this.editWindow.style.maxHeight = '735px';
        this.editWindow.style.minHeight = '270px';
        this.editWindow.style.top = '8%';
        $("body").prepend(this.editWindow);

        let onResize = (e) => {
            tdModeControlsComp.editWindow.style.left = ((document.querySelector('body').offsetWidth / 2) - (tdModeControlsComp.editWindow.offsetWidth / 2)) + 'px';

        };

        let onKeydown = (e) => {
            if (e.key === "Enter") {
                tdModeControlsComp.onEditOK();
            }
            else if (e.key === "Escape") {
                tdModeControlsComp.onEditCancel();
            }
        };

        let onComponentChanged = (e) => {
            tdModeControlsComp.loadEditor(e.target);
        };

        this.editWindowHandlerLoader = (el) => {
            window.addEventListener('resize', onResize);
            window.addEventListener('keydown', onKeydown);
            el.addEventListener('componentinitialized', onComponentChanged);
            el.addEventListener('componentchanged', onComponentChanged);
            el.addEventListener('componentremoved', onComponentChanged);
        };

        this.editWindowHandlerUnloader = (el) => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('keydown', onKeydown);
            el.removeEventListener('componentinitialized', onComponentChanged);
            el.removeEventListener('componentchanged', onComponentChanged);
            el.removeEventListener('componentremoved', onComponentChanged);
        };

        this.onEditOK = (e) => {
            const editPanel = document.querySelector('#edit_panel');
            const headStr = $(editPanel).children('h4')[0].innerHTML;
            let elId = headStr.substr(headStr.indexOf('#') + 1);
            if (elId === '') {
                tdModeControlsComp.onEditCancel(e);
                return;
            }
            const el = document.getElementById(elId);
            if (el !== null) {
                let taskDetail = [];
                const outerUL = $(editPanel).children('ul')[0];
                const attrNum = $(outerUL).children('li').length;
                if (el.components !== undefined) {
                    let orgVal, newVal;
                    if (el.tagName !== 'A-TRIGGER' && el.tagName !== 'A-FLAG') {
                        orgVal = '' + el.getAttribute('visible');
                        newVal = $($(outerUL).children('li')[0]).children('input')[0].value;
                        if (orgVal !== newVal) {
                            taskDetail.push({ componentName: 'visible', prevVal: orgVal });
                            el.setAttribute('visible', newVal);
                        }
                        orgVal = AFRAME.utils.coordinates.stringify(el.getAttribute('position'));
                        newVal = $($(outerUL).children('li')[1]).find('input')[0].value;
                        if (orgVal !== newVal) {
                            taskDetail.push({ componentName: 'position', prevVal: orgVal });
                            el.setAttribute('position', newVal);
                        }
                        orgVal = AFRAME.utils.coordinates.stringify(el.getAttribute('rotation'));
                        newVal = $($(outerUL).children('li')[1]).find('input')[1].value;
                        if (orgVal !== newVal) {
                            taskDetail.push({ componentName: 'rotation', prevVal: orgVal });
                            el.setAttribute('rotation', newVal);
                        }
                        orgVal = AFRAME.utils.coordinates.stringify(el.getAttribute('scale'));
                        newVal = $($(outerUL).children('li')[1]).find('input')[2].value;
                        if (orgVal !== newVal) {
                            taskDetail.push({ componentName: 'scale', prevVal: orgVal });
                            el.setAttribute('scale', newVal);
                        }

                        for (let i = 2; i < attrNum; ++i) {
                            const attrLI = $(outerUL).children('li')[i];
                            let idx = attrLI.innerHTML.indexOf('<ul>');
                            let attrName = '';
                            let attrVal = '';
                            if (idx === -1) {
                                attrName = attrLI.innerHTML.split(':')[0].trim();
                                attrVal = $(attrLI).children('input')[0].value;
                                orgVal = el.getAttribute(attrName);
                            } else {
                                idx = attrLI.innerHTML.indexOf(':');
                                attrName = attrLI.innerHTML.substr(0, idx).trim();
                                const propNum = $(attrLI).find('li').length;
                                for (let j = 0; j < propNum; ++j) {
                                    const propLI = $(attrLI).find('li')[j];
                                    const propName = propLI.innerHTML.split(':')[0].trim();
                                    const propVal = $(propLI).children('input')[0].value;
                                    if (propVal !== '')
                                        attrVal += propName + ':' + propVal + ';';
                                }
                                orgVal = tdModeControlsComp._stringifyMultiPropComponent(el.components[attrName].data);
                            }
                            if (orgVal !== attrVal) {
                                taskDetail.push({ componentName: attrName, prevVal: orgVal });
                                el.setAttribute(attrName, attrVal);
                            }
                        }
                    }
                    else {
                        let compName;
                        if (el.tagName === 'A-TRIGGER')
                            compName = 'trigger';
                        else
                            compName = 'flag';
                        let orgVal, newVal;
                        orgVal = tdModeControlsComp._stringifyMultiPropComponent(el.components[compName].data);
                        newVal = '';
                        for (let li of outerUL.children) {
                            attrName = li.innerText.split(':')[0].trim();
                            attrVal = $(li).children('input')[0].value;
                            newVal += attrName + ':' + attrVal + ';';
                        }
                        if (orgVal !== newVal) {
                            taskDetail.push({ componentName: compName, prevVal: orgVal });
                            el.setAttribute(compName, newVal);
                        }
                    }
                }
                else {
                    for (let i = 0; i < attrNum; ++i) {
                        const attrLI = $(outerUL).children('li')[i];
                        const attrName = attrLI.innerHTML.split(':')[0].trim();
                        const attrVal = $(attrLI).children('input')[0].value;
                        const orgVal = el.getAttribute(attrName);
                        if (orgVal !== attrVal) {
                            taskDetail.push({ componentName: attrName, prevVal: orgVal });
                            el.setAttribute(attrName, attrVal);
                        }
                    }
                }
                interactionManagerComp.writeInteraction(el, 'component', 'total', taskDetail);
            }
            tdModeControlsComp.onEditCancel(e);
        };

        this.onEditCancel = (e) => {
            tdModeControlsComp.editWindow.style.zIndex = '0';
            tdModeControlsComp.editWindow.style.display = 'none';
            tdModeControlsComp.el.addEventListener('mousedown', tdModeControlsComp.onMouseDown, false);
            tdModeControlsComp.el.addEventListener('touchstart', tdModeControlsComp.onTouchStart, false);
            tdModeControlsComp.enableKeyEvent = true;
            const wasdControlsEl = document.querySelector('[wasd-controls]');
            if (wasdControlsEl !== null)
                wasdControlsEl.getAttribute('wasd-controls').enabled = true;
            document.activeElement.blur();
            if (tdModeControlsComp.leftSideMultiTab.selected === 0)
                tdModeControlsComp.editWindowHandlerUnloader(tdModeControlsComp.HierarchyView.getSelectedEl());
            else if (tdModeControlsComp.leftSideMultiTab.selected === 2)
                tdModeControlsComp.editWindowHandlerUnloader(tdModeControlsComp.FlagView.getSelectedEl());
            tdModeControlsComp.leftSideMultiTab.activate = true;
        };

        this.loadEditor = (el) => {
            if (el.tagName === 'A-USER') return;
            tdModeControlsComp.leftSideMultiTab.activate = false;
            const editPanel = document.querySelector('#edit_panel');
            editPanel.innerHTML = "<h4>&lt;" + el.tagName + "&gt; #" + el.id + "</h4>";
            if (el.components !== undefined) {
                if (tdModeControlsComp.leftSideMultiTab.selected === 0) {
                    el.setAttribute('visible', el.getAttribute('visible'));
                    editPanel.innerHTML += "<ul><li>visible : <input type='text' value='" + el.getAttribute('visible') + "'></li>" +
                        "<li>transform<ul>" +
                        "<li>position : <input type='text' value='" + AFRAME.utils.coordinates.stringify(el.getAttribute('position')) + "'><img class='propRemove' target='position' src='/img/icon/minus in circle.svg'></li>" +
                        "<li>rotation : <input type='text' value='" + AFRAME.utils.coordinates.stringify(el.getAttribute('rotation')) + "'><img class='propRemove' target='rotation' src='/img/icon/minus in circle.svg'></li>" +
                        "<li>scale : <input type='text' value='" + AFRAME.utils.coordinates.stringify(el.getAttribute('scale')) + "'><img class='propRemove' target='scale' src='/img/icon/minus in circle.svg'></li></ul></li></ul>";
                    const outerUL = $(editPanel).children('ul')[0];
                    for (let componentName in el.components) {
                        if (componentName === 'visible' || componentName === 'position' || componentName === 'rotation' || componentName === 'scale') continue;
                        if (el.components[componentName].isSingleProperty === false) {
                            outerUL.innerHTML += "<li>" + componentName + " : <img class='propRemove' target='" + componentName + "' src='/img/icon/minus in circle.svg'><ul></ul></li>";
                            const uls = $(outerUL).find('ul');
                            const lastUL = uls[uls.length - 1];
                            const componentData = el.components[componentName].data;
                            for (let prop in componentData) {
                                if (componentData[prop] === undefined) continue;
                                let liHTML = "<li>" + prop + " : <input type='text' value='";

                                if (componentData[prop] && '' + componentData[prop] === '[object Object]') {
                                    for (let innerProp in componentData[prop]) {
                                        liHTML += componentData[prop][innerProp] + ' ';
                                    }
                                }
                                else {
                                    liHTML += el.components[componentName].data[prop];
                                }
                                liHTML.trim();
                                liHTML += "'><img class='propRemove' target='" + componentName + "." + prop + "' src='/img/icon/minus in circle.svg'></li>";
                                lastUL.innerHTML += liHTML;
                            }
                        } else {
                            outerUL.innerHTML += "<li>" + componentName + " : <input type='text' value='" + el.components[componentName].attrValue + "'><img class='propRemove' target='" + componentName + "' src='/img/icon/minus in circle.svg'></li>";
                        }
                    }
                    $('.propRemove').css('position', 'relative');
                    $('.propRemove').css('height', '20px');
                    $('.propRemove').css('width', '20px');
                    $('.propRemove').css('top', '5px');
                    editPanel.innerHTML += "<b>Add attribute</b><br><input id='setAttrArg1' type='text' style='width:100px;'><input id='setAttrArg2' type='text' style='width:100px;'><input id='setAttrArg3' type='text' style='width:100px;'><button id='addAttr'>Add</button>";

                    document.querySelector('#addAttr').addEventListener('click', (e) => {
                        let arg1 = document.querySelector('#setAttrArg1').value;
                        let arg2 = document.querySelector('#setAttrArg2').value;
                        let arg3 = document.querySelector('#setAttrArg3').value;
                        let pv = null;
                        document.querySelector('#setAttrArg1').value = '';
                        document.querySelector('#setAttrArg2').value = '';
                        document.querySelector('#setAttrArg3').value = '';
                        if (arg1 !== '') {
                            if (arg2 !== '') {
                                if (arg3 !== '') {
                                    if (el.components[arg1]) {
                                        if (el.components[arg1].data[arg2] !== arg3) {
                                            pv = tdModeControlsComp._stringifyMultiPropComponent(el.components[arg1].data);
                                        }
                                    }
                                    else {
                                        pv = null;
                                    }
                                    el.setAttribute(arg1, arg2, arg3);

                                } else {
                                    if (el.mappings[arg1]) {
                                        let tmp = el.mappings[arg1].split('.');
                                        arg3 = arg2;
                                        arg1 = tmp[0];
                                        arg2 = tmp[1];
                                        if (!el.components[arg1]) {
                                            pv = null;
                                        }
                                        else if (el.components[arg1].data[arg2] !== arg3) {
                                            pv = tdModeControlsComp._stringifyMultiPropComponent(el.components[arg1].data);
                                        }
                                        el.setAttribute(arg1, arg2, arg3);
                                    }
                                    else {
                                        if (el.getAttribute(arg1) !== arg2) {
                                            pv = el.getAttribute(arg1);
                                            el.setAttribute(arg1, arg2);
                                        }
                                    }
                                }
                            }
                            else {
                                if (!el.getAttribute(arg1)) {
                                    pv = null;
                                    el.setAttribute(arg1, '');
                                }
                            }
                        }
                        interactionManagerComp.writeInteraction(el, 'component', 'add', { componentName: arg1, prevVal: pv });
                        tdModeControlsComp.loadEditor(el);
                    });

                    let propRemoveEls = document.querySelectorAll('.propRemove');
                    for (let bt of propRemoveEls) {
                        bt.addEventListener('click', (e) => {
                            let pv = null;
                            let targetAttribute = e.target.getAttribute('target').split('.');
                            if (targetAttribute.length !== 0) {
                                if (targetAttribute[0] == 'position' || targetAttribute[0] == 'rotation' || targetAttribute[0] == 'scale') {
                                    if (AFRAME.utils.coordinates.stringify(el.getAttribute(targetAttribute[0])) === AFRAME.utils.coordinates.stringify(AFRAME.components[targetAttribute[0]].schema.default))
                                        return;
                                    pv = AFRAME.utils.coordinates.stringify(el.getAttribute(targetAttribute[0]));
                                    el.setAttribute(targetAttribute[0], AFRAME.utils.coordinates.stringify(AFRAME.components[targetAttribute[0]].schema.default));
                                }
                                else {
                                    pv = tdModeControlsComp._stringifyMultiPropComponent(el.components[targetAttribute[0]].data);
                                    if (targetAttribute.length < 2) {
                                        el.removeAttribute(targetAttribute[0]);
                                    }
                                    else {
                                        el.removeAttribute(targetAttribute[0], targetAttribute[1]);
                                    }
                                }
                                interactionManagerComp.writeInteraction(el, 'component', 'remove', { componentName: targetAttribute[0], prevVal: pv });
                            }
                            tdModeControlsComp.loadEditor(el);
                        });
                    }
                }
                else if (tdModeControlsComp.leftSideMultiTab.selected === 2) {
                    const outerUL = document.createElement('ul');
                    editPanel.appendChild(outerUL);

                    for (let componentName in el.components) {
                        const componentData = el.components[componentName].data;
                        for (let prop in componentData) {
                            if (componentData[prop] === undefined) continue;
                            let liHTML = "<li>" + prop + " : <input type='text' value='";

                            if (componentData[prop] && '' + componentData[prop] === '[object Object]') {
                                for (let innerProp in componentData[prop]) {
                                    liHTML += componentData[prop][innerProp] + ' ';
                                }
                            }
                            else {
                                liHTML += el.components[componentName].data[prop];
                            }
                            liHTML.trim();
                            liHTML += "'></li>";
                            outerUL.innerHTML += liHTML;
                        }
                    }
                }
            }
            else {
                const outerUL = document.createElement('ul');
                editPanel.appendChild(outerUL);
                for (let attr of el.attributes) {
                    if (attr.name !== 'id')
                        outerUL.innerHTML += "<li>" + attr.name + " : <input type='text' value='" + attr.value + "'></li>";
                }
            }

            tdModeControlsComp.editWindow.style.zIndex = '10000';
            tdModeControlsComp.editWindow.style.display = 'block';
            tdModeControlsComp.el.removeEventListener('mousedown', tdModeControlsComp.onMouseDown);
            tdModeControlsComp.el.removeEventListener('touchstart', tdModeControlsComp.onTouchStart);
            tdModeControlsComp.enableKeyEvent = false;
            const wasdControlsEl = document.querySelector('[wasd-controls]');
            if (wasdControlsEl !== null)
                wasdControlsEl.getAttribute('wasd-controls').enabled = false;
            tdModeControlsComp.editWindowHandlerLoader(el);
            tdModeControlsComp.editWindow.style.left = ((document.querySelector('body').offsetWidth / 2) - (tdModeControlsComp.editWindow.offsetWidth / 2)) + 'px'; // for dynamic resizing
        };

        document.querySelector('#edit_cancel').addEventListener('click', this.onEditCancel);
        document.querySelector('#edit_ok').addEventListener('click', this.onEditOK);
    },

    /**
     * Initialize the leftSideWindow containing the hierarchy view, flag-trigger tree view, and peer view.
     * The hierarchy view shows the hierarchy of objects composing the scene and supports changing the hierarchy structure through drag and drop.
     * The flag-trigger view shows a tree of flags and triggers for defining events emitted by complex conditions in the scene.
     * The peer view shows a list of other users currently participating in the workspace session.
     */
    initleftSideWindow: function () {
        let tdModeControlsComp = this;
        document.querySelector('body').style.margin = 0;
        this.leftSideWindow = document.createElement('div');
        this.el.setAttribute('embedded', true);
        this.leftSideWindow.id = 'leftSideWindow';
        this.leftSideWindow.style.position = 'fixed';
        this.leftSideWindow.height = window.innerHeight + 'px';;
        this.leftSideWindow.style.width = '25%';
        this.leftSideWindow.minWidth = '315px';
        this.leftSideWindow.maxWidth = '450px';

        this.leftSideMultiTab = new MultiTab(this.leftSideWindow, '#bfd3e2', '#82a5be');
        this.HierarchyView = new HierarchyView(this);
        this.leftSideMultiTab.pushTab(this.HierarchyView.view, 'hierarchy');
        this.PeerView = new PeerView(this);
        this.leftSideMultiTab.pushTab(this.PeerView.view, 'peer');
        this.FlagView = new FlagView(this);
        this.leftSideMultiTab.pushTab(this.FlagView.view, 'flags');

        this.el.addEventListener('child-attached', (e) => {
            let child = e.detail.el;
            if (!child.tagName.startsWith('A-') || child.tagName === 'A-ASSETS' || child.tagName === 'A-ASSET-ITEM') return;
            if (child.tagName === 'A-USER') {
                let liEl = document.createElement('li');
                liEl.style.listStyleType = 'none';
                liEl.innerHTML = child.name;
                $(this.PeerView.view).children('ul')[0].appendChild(liEl);
                this.PeerView.LiByNode.set(child, liEl);
            }
            else if (child.tagName === 'A-TRIGGER' || child.tagName === 'A-FLAG') {
                let thisNum = this.FlagView.nodeNumByEl.get(child);
                if (thisNum !== undefined) return;
                let parent = e.target;
                let parentNum = this.FlagView.nodeNumByEl.get(parent);
                if (parentNum === undefined)
                    parentNum = -1;
                let nd = this.FlagView.makeNode(child, parentNum);
                this.FlagView.spreadOnPath(nd.num);
            }
            else {
                let thisNum = this.HierarchyView.nodeNumByEl.get(child);
                if (thisNum !== undefined) return;
                let parent = e.target;
                let parentNum = this.HierarchyView.nodeNumByEl.get(parent);
                if (parentNum === undefined)
                    parentNum = -1;
                this.HierarchyView.makeNode(child, parentNum);
            }
        });
        this.el.addEventListener('child-detached', (e) => {
            let child = e.detail.el;
            if (!child.tagName.startsWith('A-') || child.tagName === 'A-ASSETS' || child.tagName === 'A-ASSET-ITEM') return;
            if (child.tagName === 'A-USER') {
                let liEl = this.PeerView.LiByNode.get(child);
                if (liEl !== undefined) {
                    liEl.parentElement.removeChild(liEl);
                    this.PeerView.LiByNode.delete(child);
                }
            }
            else if (child.tagName === 'A-TRIGGER' || child.tagName === 'A-FLAG') {
                let childNum = this.FlagView.nodeNumByEl.get(child);
                if (childNum !== undefined) {
                    this.FlagView.removeNode(childNum);
                    if (this.FlagView.selectedNodeNum === childNum)
                        this.FlagView.selectedNodeNum = -1;
                }
            }
            else {
                let childNum = this.HierarchyView.nodeNumByEl.get(child);
                if (childNum !== undefined) {
                    this.HierarchyView.removeNode(childNum);
                    if (this.HierarchyView.selectedNodeNum === childNum)
                        this.HierarchyView.selectedNodeNum = -1;
                }
            }
        });

        $('body').prepend(this.leftSideWindow);

        this.el.style.height = (window.innerHeight) + 'px';
        this.el.style.width = 'calc(100% - ' + this.leftSideWindow.offsetWidth + 'px)';
        this.el.style.left = this.leftSideWindow.offsetWidth + 'px';

        window.addEventListener('resize', (e) => {
            let sceneEl = tdModeControlsComp.el;
            sceneEl.style.height = (window.innerHeight) + 'px';
            sceneEl.style.width = 'calc(100% - ' + tdModeControlsComp.leftSideWindow.offsetWidth + 'px)';
            sceneEl.style.left = tdModeControlsComp.leftSideWindow.offsetWidth + 'px';
            this.leftSideWindow.height = window.innerHeight + 'px';
        });
    },

    /**
     * Initializes helpWindow to display a list of shortcuts.
     */
    initHelpWindow: function () {
        let tdModeControlsComp = this;
        this.helpWindow = document.createElement('div');
        this.helpWindow.innerHTML = "<div id='help_panel' style='position:absolute; overflow:auto; width:780px; height:550px; top:10px; left:10px;'><table width=100% height=100%><tr valign='top'><td width=50%><ul><li style='line-height:2em'>q, Q : toggleSpace</li><li style='line-height:2em'>t, T : translate mode</li><li style='line-height:2em'>r, R : rotate mode</li><li style='line-height:2em'>e, E : scale mode</li><li style='line-height:2em'>x, X : toggle show x</li><li style='line-height:2em'>y, Y : toggle show y</li><li style='line-height:2em'>z , Z : toggle show z</li><li style='line-height:2em'>numpad+ : gizmo size up</li><li style='line-height:2em'>numpad-: gizmo size down </li><li style='line-height:2em'>space bar : toggle active gizmo</li><li style='line-height:2em'>esc : detach gizmo</li></ul></td><td><ul><li style='line-height:2em'>w, W : move the camera forward</li><li style='line-height:2em'>s, S : move the camera backward</li><li style='line-height:2em'>a, A : move the camera left</li><li style='line-height:2em'>d, D : move the camera right</li><li style='line-height:2em'>. : camera speed+(small)</li><li style='line-height:2em'>&gt; : camera speed+(large)</li><li style='line-height:2em'>, : camera speed-(small)</li><li style='line-height:2em'>&lt; : camera speed-(large)</li><li style='line-height:2em'>f, F : convert to VR mode</li><li style='line-height:2em'>h, H : toggle hovering mode</li><li style='line-height:2em'>u, U : toggle UI Display</li><li style='line-height:2em'>insert, &lt;ctrl&gt; + i : load insert window</li><li style='line-height:2em'>enter : load edit window</li><li style='line-height:2em'>delete, &lt;ctrl&gt; + d : delete selected element</li><li style='line-height:2em'>&lt;ctrl&gt; + z : undo</li><li style='line-height:2em'>&lt;ctrl&gt; + &lt;shift&gt; + z : redo</li><li style='line-height:2em'>? : load helper</li></ul></td></tr></table></div><div style='position:absolute; width:780px; left:10px; top:570px; text-align:right;'><button id='help_close'>Close</button></div>";
        this.helpWindow.style.backgroundColor = 'lightblue';
        this.helpWindow.style.display = 'none';
        this.helpWindow.style.position = 'fixed';
        this.helpWindow.style.width = '80%';
        this.helpWindow.style.height = '60%';
        this.helpWindow.style.maxWidth = '800px';
        this.helpWindow.style.maxHeight = '600px';
        this.helpWindow.style.top = '15%';
        this.helpWindow.style.overflow = 'auto';

        $("body").prepend(this.helpWindow);

        let onResize = (e) => {
            tdModeControlsComp.helpWindow.style.left = ((document.querySelector('body').offsetWidth / 2) - (tdModeControlsComp.helpWindow.offsetWidth / 2)) + 'px';
        };

        let onKeydown = (e) => {
            if (e.key === "Escape") {
                tdModeControlsComp.closeHelper();
            }
        };

        this.helpWindowHandlerLoader = () => {
            window.addEventListener('resize', onResize);
            window.addEventListener('keydown', onKeydown);
        };

        this.helpWindowHandlerUnloader = () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('keydown', onKeydown);
        };

        this.closeHelper = (e) => {
            tdModeControlsComp.helpWindow.style.zIndex = '0';
            tdModeControlsComp.helpWindow.style.display = 'none';
            tdModeControlsComp.el.addEventListener('mousedown', tdModeControlsComp.onMouseDown, false);
            tdModeControlsComp.el.addEventListener('touchstart', tdModeControlsComp.onTouchStart, false);
            tdModeControlsComp.enableKeyEvent = true;
            const wasdControlsEl = document.querySelector('[wasd-controls]');
            if (wasdControlsEl !== null)
                wasdControlsEl.getAttribute('wasd-controls').enabled = true;
            document.activeElement.blur();
            tdModeControlsComp.helpWindowHandlerUnloader();
        };

        this.loadHelper = () => {
            tdModeControlsComp.helpWindow.style.zIndex = '10000';
            tdModeControlsComp.helpWindow.style.display = 'block';
            tdModeControlsComp.el.removeEventListener('mousedown', tdModeControlsComp.onMouseDown);
            tdModeControlsComp.el.removeEventListener('touchstart', tdModeControlsComp.onTouchStart);
            tdModeControlsComp.enableKeyEvent = false;
            const wasdControlsEl = document.querySelector('[wasd-controls]');
            if (wasdControlsEl !== null)
                wasdControlsEl.getAttribute('wasd-controls').enabled = false;
            tdModeControlsComp.helpWindowHandlerLoader();
            tdModeControlsComp.helpWindow.style.left = ((document.querySelector('body').offsetWidth / 2) - (this.helpWindow.offsetWidth / 2)) + 'px'; // for dynamic resizing
        };

        document.querySelector('#help_close').addEventListener('click', this.closeHelper);
    },

    /**
     * Initialize the sessionListWindow to display the list of session logs.
     */
    initSessionListWindow: function () {
        let tdModeControlsComp = this;
        this.sessionListWindow = document.createElement('div');
        this.sessionListWindow.innerHTML = "<div id='session_list_panel' style='position:absolute; overflow:auto; width:780px; height:550px; top:10px; left:10px;'><table width=100% height=100%><tr><th>session id</th><th>start</th><th>end</th></tr></table></div><div style='position:absolute; width:780px; left:10px; top:570px; text-align:right;'><button id='session_list_close'>Close</button></div>";
        this.sessionListWindow.style.backgroundColor = 'lightblue';
        this.sessionListWindow.style.display = 'none';
        this.sessionListWindow.style.position = 'fixed';
        this.sessionListWindow.style.width = '80%';
        this.sessionListWindow.style.height = '60%';
        this.sessionListWindow.style.maxWidth = '800px';
        this.sessionListWindow.style.maxHeight = '600px';
        this.sessionListWindow.style.top = '15%';
        this.sessionListWindow.style.overflow = 'auto';

        $("body").prepend(this.sessionListWindow);

        let onResize = (e) => {
            tdModeControlsComp.sessionListWindow.style.left = ((document.querySelector('body').offsetWidth / 2) - (tdModeControlsComp.sessionListWindow.offsetWidth / 2)) + 'px';
        };

        let onKeydown = (e) => {
            if (e.keyCode === 27) {//esc
                tdModeControlsComp.closeSessionList();
            }
        };

        this.sessionListWindowHandlerLoader = () => {
            window.addEventListener('resize', onResize);
            window.addEventListener('keydown', onKeydown);
        };

        this.sessionListWindowHandlerUnloader = () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('keydown', onKeydown);
        };

        this.closeSessionList = (e) => {
            tdModeControlsComp.sessionListWindow.style.zIndex = '0';
            tdModeControlsComp.sessionListWindow.style.display = 'none';
            tdModeControlsComp.el.addEventListener('mousedown', tdModeControlsComp.onMouseDown, false);
            tdModeControlsComp.el.addEventListener('touchstart', tdModeControlsComp.onTouchStart, false);
            tdModeControlsComp.enableKeyEvent = true;
            const wasdControlsEl = document.querySelector('[wasd-controls]');
            if (wasdControlsEl !== null)
                wasdControlsEl.getAttribute('wasd-controls').enabled = true;
            document.activeElement.blur();
            tdModeControlsComp.sessionListWindowHandlerUnloader();
        };

        this.loadSessionList = () => {
            tdModeControlsComp.sessionListWindow.style.zIndex = '10000';
            tdModeControlsComp.sessionListWindow.style.display = 'block';
            tdModeControlsComp.el.removeEventListener('mousedown', tdModeControlsComp.onMouseDown);
            tdModeControlsComp.el.removeEventListener('touchstart', tdModeControlsComp.onTouchStart);
            tdModeControlsComp.enableKeyEvent = false;
            const wasdControlsEl = document.querySelector('[wasd-controls]');
            if (wasdControlsEl !== null)
                wasdControlsEl.getAttribute('wasd-controls').enabled = false;
            tdModeControlsComp.sessionListWindowHandlerLoader();
            tdModeControlsComp.sessionListWindow.style.left = ((document.querySelector('body').offsetWidth / 2) - (this.helpWindow.offsetWidth / 2)) + 'px'; // for dynamic resizing

            let table = document.querySelector('#session_list_panel table');
            table.innerHTML = "Loading...";
            let wid = window.wid;

            $.ajax({
                url: '/workspace/sessions?id=' + wid,
                type: 'GET',
                success: (result) => {
                    table.innerHTML = "<tr><th>session id</th><th>start</th><th>end</th></tr>";
                    for (const session of result) {
                        let row = document.createElement('tr');
                        row.innerHTML = `<td>${session.id}</td><td>${session.start_time}</td><td>${session.end_time}</td><td><a href="/workspace/sessions?id=${wid}&sid=${session.id}">download</a></td>`;
                        table.appendChild(row);
                    }
                },
                error: (err) => {
                    table.innerHTML = err.toString();
                    console.log(err);
                }
            });
        };

        document.querySelector('#session_list_close').addEventListener('click', this.closeSessionList);
    },

    /**
     * Initialize the UI buttons that are overlaid on the scene viewport.
     */
    initUILayer: function () {
        document.oncontextmenu = function () { return false; } // For prevent right click
        document.onselectstart = function () { return false; } // For prevent drag
        document.ondragstart = function () { return false; } // For prevent block selection

        let unitSize = Math.floor(this.el.offsetWidth * 0.04);

        this.UIDisplay = true;

        this.UILayer1 = document.createElement('div');
        $("body").prepend(this.UILayer1);
        this.UILayer1.id = 'UIGroup1';
        this.UILayer1.style.position = 'fixed';
        this.UILayer1.style.zIndex = 9999;
        this.UILayer1.style.height = unitSize + 'px';
        this.UILayer1.style.minHeight = '40px';
        this.UILayer1.style.width = (this.UILayer1.offsetHeight * 8) + 'px';
        this.UILayer1.style.top = '2px';
        this.UILayer1.style.left = (this.el.offsetLeft + this.el.offsetWidth - this.UILayer1.offsetWidth - 2) + 'px';

        let sessionButtonUI = document.createElement('div');
        sessionButtonUI.id = 'sessionButtonUI';
        $(sessionButtonUI).addClass('buttonUI');
        sessionButtonUI.style.display = 'inline-block';
        sessionButtonUI.style.height = '100%';
        this.UILayer1.appendChild(sessionButtonUI);

        this.sessionButton = document.createElement('img');
        this.sessionButton.setAttribute('src', '/img/icon/history in circle.svg');
        this.sessionButton.style.height = 'calc(100% - 4px)';
        this.sessionButton.style.cursor = 'pointer';
        this.sessionButton.style.padding = '2px';
        this.sessionButton.addEventListener('click', () => {
            this.loadSessionList();
        });
        sessionButtonUI.appendChild(this.sessionButton);

        let copyButtonUI = document.createElement('div');
        copyButtonUI.id = 'CopyButtonUI';
        $(copyButtonUI).addClass('buttonUI');
        copyButtonUI.style.display = 'inline-block';
        copyButtonUI.style.height = '100%';
        this.UILayer1.appendChild(copyButtonUI);

        this.copyButton = document.createElement('img');
        this.copyButton.setAttribute('src', '/img/icon/content_copy in circle.svg');
        this.copyButton.style.height = 'calc(100% - 4px)';
        this.copyButton.style.cursor = 'pointer';
        this.copyButton.style.padding = '2px';
        this.copyButton.addEventListener('click', () => {
            navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([this._stringifyContent()], { type: 'text/plain' }) })]).then(() => {
                console.log('success copy to clipboard');
            }, () => {
                console.log('fail copy to clipboard');
            });
        });
        copyButtonUI.appendChild(this.copyButton);

        let PCDstoringButtonUI = document.createElement('div');
        PCDstoringButtonUI.id = 'PCDstoringButtonUI';
        $(PCDstoringButtonUI).addClass('buttonUI');
        PCDstoringButtonUI.style.display = 'inline-block';
        PCDstoringButtonUI.style.height = '100%';
        this.UILayer1.appendChild(PCDstoringButtonUI);

        this.PCDstoringButton = document.createElement('img');
        this.PCDstoringButton.setAttribute('src', '/img/icon/PCD.svg');
        this.PCDstoringButton.style.height = 'calc(100% - 4px)';
        this.PCDstoringButton.style.cursor = 'pointer';
        this.PCDstoringButton.style.padding = '2px';
        this.PCDstoringButton.addEventListener('click', () => {
            this.loadPCDWindow();
            console.log("PCD storing button clicked");
        });
        PCDstoringButtonUI.appendChild(this.PCDstoringButton);

        let saveButtonUI = document.createElement('div');
        saveButtonUI.id = 'SaveButtonUI';
        $(saveButtonUI).addClass('buttonUI');
        saveButtonUI.style.display = 'inline-block';
        saveButtonUI.style.height = '100%';
        this.UILayer1.appendChild(saveButtonUI);

        this.saveButton = document.createElement('img');
        this.saveButton.setAttribute('src', '/img/icon/upload in circle.svg');
        this.saveButton.style.height = 'calc(100% - 4px)';
        this.saveButton.style.cursor = 'pointer';
        this.saveButton.style.padding = '2px';
        this.saveButton.addEventListener('click', () => {
            this._saveContent();
        });
        saveButtonUI.appendChild(this.saveButton);

        let insertButtonUI = document.createElement('div');
        insertButtonUI.id = 'InsertButtonUI';
        $(insertButtonUI).addClass('buttonUI');
        insertButtonUI.style.display = 'inline-block';
        insertButtonUI.style.height = '100%';
        this.UILayer1.appendChild(insertButtonUI);

        this.insertButton = document.createElement('img');
        this.insertButton.setAttribute('src', '/img/icon/plus in circle.svg');
        this.insertButton.style.height = 'calc(100% - 4px)';
        this.insertButton.style.cursor = 'pointer';
        this.insertButton.style.padding = '2px';
        this.insertButton.addEventListener('click', () => {
            this.loadInsertWindow();
        });
        insertButtonUI.appendChild(this.insertButton);

        let enterButtonUI = document.createElement('div');
        enterButtonUI.id = 'EnterButtonUI';
        $(enterButtonUI).addClass('buttonUI');
        enterButtonUI.style.display = 'inline-block';
        enterButtonUI.style.height = '100%';
        this.UILayer1.appendChild(enterButtonUI);

        this.enterButton = document.createElement('img');
        this.enterButton.setAttribute('src', '/img/icon/check in circle.svg');
        this.enterButton.style.height = 'calc(100% - 4px)';
        this.enterButton.style.cursor = 'pointer';
        this.enterButton.style.padding = '2px';
        this.enterButton.addEventListener('click', () => {
            let selectedEl;
            if (this.leftSideMultiTab.selected === 0)
                selectedEl = this.HierarchyView.getSelectedEl();
            else if (this.leftSideMultiTab.selected === 2)
                selectedEl = this.FlagView.getSelectedEl();
            if (selectedEl !== null)
                this.loadEditor(selectedEl);
        });
        enterButtonUI.appendChild(this.enterButton);

        let deleteButtonUI = document.createElement('div');
        deleteButtonUI.id = 'DeleteButtonUI';
        $(deleteButtonUI).addClass('buttonUI');
        deleteButtonUI.style.display = 'inline-block';
        deleteButtonUI.style.height = '100%';
        this.UILayer1.appendChild(deleteButtonUI);

        this.deleteButton = document.createElement('img');
        this.deleteButton.setAttribute('src', '/img/icon/trashcan in circle.svg');
        this.deleteButton.style.height = 'calc(100% - 4px)';
        this.deleteButton.style.cursor = 'pointer';
        this.deleteButton.style.padding = '2px';
        this.deleteButton.addEventListener('click', () => {
            this._delete();
        });
        deleteButtonUI.appendChild(this.deleteButton);

        let helpButtonUI = document.createElement('div');
        helpButtonUI.id = 'HelpButtonUI';
        $(helpButtonUI).addClass('buttonUI');
        helpButtonUI.style.display = 'inline-block';
        helpButtonUI.style.height = '100%';
        this.UILayer1.appendChild(helpButtonUI);

        this.helpButton = document.createElement('img');
        this.helpButton.setAttribute('src', '/img/icon/question in circle.svg');
        this.helpButton.style.height = 'calc(100% - 4px)';
        this.helpButton.style.cursor = 'pointer';
        this.helpButton.style.padding = '2px';
        this.helpButton.addEventListener('click', () => {
            this.loadHelper();
        });
        helpButtonUI.appendChild(this.helpButton);

        this.UILayer2 = document.createElement('div');
        $("body").prepend(this.UILayer2);
        this.UILayer2.id = 'UIGroup2';
        this.UILayer2.style.position = 'fixed';
        this.UILayer2.style.zIndex = 9999;
        this.UILayer2.style.height = unitSize + 'px';
        this.UILayer2.style.minHeight = '40px';
        this.UILayer2.style.width = (this.UILayer2.offsetHeight * 4) + 'px';
        this.UILayer2.style.bottom = '2px';
        this.UILayer2.style.left = (this.el.offsetLeft + (this.el.offsetWidth / 2) * 0.8) + 'px';

        let coordinatesButtonUI = document.createElement('div');
        coordinatesButtonUI.id = 'CoordinatesButtonUI';
        $(coordinatesButtonUI).addClass('buttonUI');
        coordinatesButtonUI.style.display = 'inline-block';
        coordinatesButtonUI.style.height = '100%';
        this.UILayer2.appendChild(coordinatesButtonUI);

        this.coordinatesButton = document.createElement('img');
        this.coordinatesButton.setAttribute('src', '/img/icon/earth in circle.svg');
        this.coordinatesButton.style.height = 'calc(100% - 4px)';
        this.coordinatesButton.style.padding = '2px';
        this.coordinatesButton.style.cursor = 'pointer';
        this.coordinatesButton.addEventListener('click', () => {
            this._toggleSpace();
        });
        coordinatesButtonUI.appendChild(this.coordinatesButton);

        let translateButtonUI = document.createElement('div');
        translateButtonUI.id = 'TranslateButtonUI';
        $(translateButtonUI).addClass('buttonUI');
        translateButtonUI.style.display = 'inline-block';
        translateButtonUI.style.height = '100%';
        this.UILayer2.appendChild(translateButtonUI);

        this.translateButton = document.createElement('img');
        this.translateButton.setAttribute('src', '/img/icon/position in circle_active.svg');
        this.translateButton.style.height = 'calc(100% - 4px)';
        this.translateButton.style.padding = '2px';
        this.translateButton.style.cursor = 'pointer';
        this.translateButton.addEventListener('click', () => {
            this._setModeTranslate();
        });
        translateButtonUI.appendChild(this.translateButton);

        let rotateButtonUI = document.createElement('div');
        rotateButtonUI.id = 'RotateButtonUI';
        $(rotateButtonUI).addClass('buttonUI');
        rotateButtonUI.style.display = 'inline-block';
        rotateButtonUI.style.height = '100%';
        this.UILayer2.appendChild(rotateButtonUI);

        this.rotateButton = document.createElement('img');
        this.rotateButton.setAttribute('src', '/img/icon/rotation in circle_inactive.svg');
        this.rotateButton.style.height = 'calc(100% - 4px)';
        this.rotateButton.style.padding = '2px';
        this.rotateButton.style.cursor = 'pointer';
        this.rotateButton.addEventListener('click', () => {
            this._setModeRotate();
        });
        rotateButtonUI.appendChild(this.rotateButton);

        let scaleButtonUI = document.createElement('div');
        scaleButtonUI.id = 'ScaleButtonUI';
        $(scaleButtonUI).addClass('buttonUI');
        scaleButtonUI.style.display = 'inline-block';
        scaleButtonUI.style.height = '100%';
        this.UILayer2.appendChild(scaleButtonUI);

        this.scaleButton = document.createElement('img');
        this.scaleButton.setAttribute('src', '/img/icon/scale in circle_inactive.svg');
        this.scaleButton.style.height = 'calc(100% - 4px)';
        this.scaleButton.style.padding = '2px';
        this.scaleButton.style.cursor = 'pointer';
        this.scaleButton.addEventListener('click', () => {
            this._setModeScale();
        });
        scaleButtonUI.appendChild(this.scaleButton);

        this.UILayer3 = document.createElement('div');
        $("body").prepend(this.UILayer3);
        this.UILayer3.id = 'UIGroup3';
        this.UILayer3.style.position = 'fixed';
        this.UILayer3.style.zIndex = 9999;
        this.UILayer3.style.height = unitSize + 'px';
        this.UILayer3.style.minHeight = '40px';
        this.UILayer3.style.width = (this.UILayer3.offsetHeight * 2) + 'px';
        this.UILayer3.style.bottom = '2px';
        this.UILayer3.style.left = (this.el.offsetLeft + 2) + 'px';

        let undoButtonUI = document.createElement('div');
        undoButtonUI.id = 'UndoButtonUI';
        $(undoButtonUI).addClass('buttonUI');
        undoButtonUI.style.display = 'inline-block';
        undoButtonUI.style.height = '100%';
        this.UILayer3.appendChild(undoButtonUI);

        this.undoButton = document.createElement('img');
        this.undoButton.setAttribute('src', '/img/icon/left in circle.svg');
        this.undoButton.style.height = 'calc(100% - 4px)';
        this.undoButton.style.padding = '2px';
        this.undoButton.style.cursor = 'pointer';
        this.undoButton.addEventListener('click', () => {
            this.el.components['interaction-manager'].undo();
        });
        undoButtonUI.appendChild(this.undoButton);

        let redoButtonUI = document.createElement('div');
        redoButtonUI.id = 'RedoButtonUI';
        $(redoButtonUI).addClass('buttonUI');
        redoButtonUI.style.display = 'inline-block';
        redoButtonUI.style.height = '100%';
        this.UILayer3.appendChild(redoButtonUI);

        this.redoButton = document.createElement('img');
        this.redoButton.setAttribute('src', '/img/icon/right in circle.svg');
        this.redoButton.style.height = 'calc(100% - 4px)';
        this.redoButton.style.padding = '2px';
        this.redoButton.style.cursor = 'pointer';
        this.redoButton.addEventListener('click', () => {
            this.el.components['interaction-manager'].redo();
        });
        redoButtonUI.appendChild(this.redoButton);

        window.addEventListener('resize', (e) => {
            if (!this.el.is('ar-mode') && !this.el.is('vr-mode'))
                this.toggleUIDisplay(window.innerHeight <= window.innerWidth);

            let unitSize = Math.floor(this.el.offsetWidth * 0.04);
            this.UILayer1.style.height = unitSize + 'px';
            this.UILayer1.style.width = (this.UILayer1.offsetHeight * 8) + 'px';
            this.UILayer2.style.height = unitSize + 'px';
            this.UILayer2.style.width = (this.UILayer2.offsetHeight * 4) + 'px';
            this.UILayer3.style.height = unitSize + 'px';
            this.UILayer3.style.width = (this.UILayer3.offsetHeight * 2) + 'px';

            this.UILayer1.style.left = (this.el.offsetLeft + this.el.offsetWidth - this.UILayer1.offsetWidth - 2) + 'px';
            this.UILayer2.style.left = (this.el.offsetLeft + (this.el.offsetWidth / 2) * 0.8) + 'px';
            this.UILayer3.style.left = (this.el.offsetLeft + 2) + 'px';
        });
        this.toggleUIDisplay(window.innerHeight <= window.innerWidth);
    },

    /**
     * Controls the visibility of the entire UI layer.
     * If there is no parameter, it is toggled, if the parameter is true, it is on, if it is false, it is off.
     */
    toggleUIDisplay: function (display) {
        if (typeof display === 'boolean')
            this.UIDisplay = !display;
        if (this.UIDisplay) {
            this.UILayer1.style.display = 'none';
            this.UILayer2.style.display = 'none';
            this.UILayer3.style.display = 'none';
            this.leftSideWindow.style.display = 'none';
            this.el.style.left = '0px';
            this.el.style.width = '100%';
            if (this.transformControls.object !== null) {
                const oldTarget = this.transformControls.object;
                this.transformControls.detach();
                this.el.emit('target-detached', { el: oldTarget }, false);
            }
            this.UIDisplay = false;
        }
        else {
            this.UILayer1.style.display = 'block';
            this.UILayer2.style.display = 'block';
            this.UILayer3.style.display = 'block';
            this.leftSideWindow.style.display = 'block';
            this.leftSideWindow.style.height = window.innerHeight + 'px';
            this.el.style.height = (window.innerHeight) + 'px';
            this.el.style.width = 'calc(100% - ' + this.leftSideWindow.offsetWidth + 'px)';
            this.el.style.left = this.leftSideWindow.offsetWidth + 'px';

            this.UIDisplay = true;
        }
        this.el.camera.aspect = this.el.canvas.offsetWidth / this.el.canvas.offsetHeight;
        this.el.camera.updateProjectionMatrix();
    },

    remove: function () {

    },

    /**
     * Change the parent object of an object.
     * The targetEl is the element of the object whose parent is to be changed,
     * and the parentEl is the element of the object that will become the new parent.
     * The targetEl's local transform matrix is modified appropriately so that the transform in world coordinates is maintained.
     * The cb is a callback function that is called when the hierarchy change is completed.
     */
    hierarchyChange: function (targetEl, parentEl, cb) {
        if (!targetEl || !parentEl) return;
        let targetObject = targetEl.object3D;
        let newMat = (new THREE.Matrix4()).copy(parentEl.object3D.matrixWorld).invert();
        newMat.multiply(targetObject.matrixWorld);

        if (this.HierarchyView.selectedNodeNum !== -1) {
            let selectedEl = this.HierarchyView.nodes[this.HierarchyView.selectedNodeNum].el;
            for (let el = selectedEl; el !== el.sceneEl; el = el.parentEl) {
                if (el === targetEl) {
                    this.transformControls.detach();
                    this.HierarchyView.nodes[this.HierarchyView.selectedNodeNum].style.background = 'transparent';
                    this.HierarchyView.selectedNodeNum = -1;
                }
            }
        }

        targetEl.parentEl.removeChild(targetEl);
        parentEl.appendChild(targetEl);

        let childAttachedHandler = (e) => {
            if (e.detail.el === targetEl) {
                targetObject.el = targetEl;

                for (let componentName of Object.keys(targetEl.components)) {
                    let comp = targetEl.components[componentName];
                    if (componentName === 'geometry' || componentName === 'obj-model' || componentName === 'gltf-model' || componentName === 'point-cloud') {
                        comp.update(comp.oldData);
                    }
                    else if (componentName === 'material') {
                        comp.update(comp.shader);
                    }
                }

                newMat.decompose(targetObject.position, targetObject.quaternion, targetObject.scale);
                targetObject.updateMatrix();
                targetEl.setAttribute('position', AFRAME.utils.coordinates.stringify(targetEl.getAttribute('position')));
                targetEl.setAttribute('rotation', AFRAME.utils.coordinates.stringify(targetEl.getAttribute('rotation')));
                targetEl.setAttribute('scale', AFRAME.utils.coordinates.stringify(targetEl.getAttribute('scale')));

                parentEl.removeEventListener('child-attached', childAttachedHandler);
                if (cb !== undefined)
                    cb();
            }
        };
        parentEl.addEventListener('child-attached', childAttachedHandler);
    }
});

class MultiTab {
    constructor(windowEl, activeBG, deactiveBG) {
        this.window = windowEl;
        this.activate = true;
        this.tabCnt = 0;
        this.selected = -1;
        this.activeBG = activeBG;
        this.deactiveBG = deactiveBG;
        let header = document.createElement('div');
        this.window.appendChild(header);
        header.style.display = 'block';
        header.style.height = '34px';

        let viewContainer = document.createElement('div');
        this.window.appendChild(viewContainer);
        viewContainer.style.display = 'block';
        viewContainer.style.height = 'calc(100% - 34px)';
    }
    pushTab(viewEl, viewName) {
        let header = this.window.children[0];
        let viewContainer = this.window.children[1];

        viewContainer.appendChild(viewEl);
        viewEl.style.backgroundColor = this.activeBG;
        viewEl.style.display = 'none';
        viewEl.style.height = '100%';

        let head = document.createElement('div');
        header.appendChild(head);
        head.idx = this.tabCnt++;
        head.innerHTML = '<b>' + viewName + '</b>';
        head.style.textAlign = 'center';
        head.style.height = '100%';
        head.style.display = 'inline-block';
        head.style.backgroundColor = this.deactiveBG;
        for (let i = 0; i < this.tabCnt; ++i) {
            header.children[i].style.width = (100 / this.tabCnt) + '%';
        }
        head.addEventListener('click', (e) => {
            this.activeTab(head.idx);
        });
        if (this.tabCnt === 1)
            this.activeTab(0);
    }
    popTab() {
        if (this.tabCnt === 0) return;
        let header = this.window.children[0];
        let viewContainer = this.window.children[1];
        header.removeChild(header.children[this.tabCnt]);
        viewContainer.removeChild(viewContainer.children[this.tabCnt]);
        if (this.tabCnt === this.selected) {
            this.activeTab(this.tabCnt - 1);
        }
    }
    activeTab(idx) {
        if (!this.activate) return;
        let header = this.window.children[0];
        let viewContainer = this.window.children[1];

        if (this.tabCnt <= idx || idx < 0) {
            this.selected = -1;
            return;
        }
        if (this.selected >= 0 && this.selected < this.tabCnt) {
            viewContainer.children[this.selected].style.display = 'none';
            header.children[this.selected].style.backgroundColor = this.deactiveBG;
        }
        viewContainer.children[idx].style.display = 'block';
        header.children[idx].style.backgroundColor = this.activeBG;
        this.selected = idx;
    }
};

class TreeView {
    constructor(tdModeControlsComp) {
        this.tdModeControlsComp = tdModeControlsComp;
        this.selectedNodeNum = -1;
        this.mousedownNodeNum = -1;
        this.view = document.createElement('div');
        this.view.style.overflow = 'auto';
        this.nextNodeNum = 0; //auto-increment
        this.parents = [];
        this.nodes = [];
        this.childrens = []; //adjacency list
        this.nodeNumByEl = new Map();//{el, nodeNum}
        this.init();
    }
    init() {
    }
    toggleFoldStatus(num) {
        if (this.childrens[num].empty()) return;
        let node = this.nodes[num];
        let ulEl = $(node).children('ul')[0];
        if (ulEl.style.display === 'block') {
            ulEl.style.display = 'none';
            $(node).children('img')[0].src = '/img/noun_Square plus_620378_000000.png';
        }
        else {
            ulEl.style.display = 'block';
            $(node).children('img')[0].src = '/img/noun_Minus Square_768834.png';
        }
    }
    spread(num) {
        if (this.childrens[num].empty()) return;
        let node = this.nodes[num];
        $(node).children('ul')[0].style.display = 'block';
        $(node).children('img')[0].src = '/img/noun_Minus Square_768834.png';
    }
    spreadOnPath(num) {
        for (let i = num; i !== -1; i = this.parents[i]) {
            this.spread(i);
        }
    }
    fold(num) {
        if (this.childrens[num].empty()) return;
        let node = this.nodes[num];
        $(node).children('ul')[0].style.display = 'none';
        $(node).children('img')[0].src = '/img/noun_Square plus_620378_000000.png';
    }
    makeNode(el, parentNum) {
        let node = document.createElement('div');
        node.el = el;
        node.num = this.nextNodeNum++;
        node.innerHTML = "<img src='/img/Transparent.gif'></img> &lt;" + el.tagName + "&gt; " + "#" + el.id;
        const ulEl = document.createElement('ul');
        node.appendChild(ulEl);

        let imgTag = $(node).children('img')[0];
        imgTag.style.height = '20px';
        imgTag.style.width = '20px';
        node.style.webkitTouchCallout = 'none'; // ios safari
        node.style.webkitUserSelect = 'none'; // chrome, safari, opera
        node.style.khtmlUserSelect = 'none'; // Konqueror
        node.style.mozUserSelect = 'none'; // firefox
        node.style.msUserSelect = 'none'; // ie, edge
        node.style.userSelect = 'none'; // ... non prefixed version
        ulEl.style.margin = '0px';
        ulEl.style.display = 'none';

        imgTag.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFoldStatus(node.num);
        });

        this.parents.push(parentNum);
        this.nodes.push(node);
        this.childrens.push(new list());
        this.nodeNumByEl.set(el, node.num);

        if (parentNum !== -1) {
            this.childrens[parentNum].pushBack(node.num);
            let parentNode = this.nodes[parentNum];
            let liEl = document.createElement('li');
            liEl.appendChild(node);
            liEl.style.listStyleType = 'none';
            $(parentNode).children('img')[0].src = '/img/noun_Square plus_620378_000000.png';
            $(parentNode).children('ul')[0].appendChild(liEl);
        }
        else {
            this.view.appendChild(node);
        }

        for (let child of el.children) {
            this.makeNode(child, node.num);
        }

        return node;
    }
    removeNode(nodeNum) { //bottomUp recursive
        for (let idx of this.childrens[nodeNum]) {
            this.removeNode(idx);
        }
        let parentNum = this.parents[nodeNum];
        let node = this.nodes[nodeNum];
        node.parentElement.removeChild(node);
        this.nodeNumByEl.delete(node.el);

        this.childrens[nodeNum] = undefined;
        this.parents[nodeNum] = undefined;
        this.nodes[nodeNum] = undefined;

        if (parentNum !== -1) {
            this.childrens[parentNum].removeNode(this.childrens[parentNum].getNode(nodeNum));
            if (this.childrens[parentNum].empty()) {
                $(this.nodes[parentNum]).children('img')[0].src = '/img/Transparent.gif';
            }
        }
    }
    getSelectedEl() {
        if (this.selectedNodeNum === -1) return null;
        return this.nodes[this.selectedNodeNum].el;
    }
};

/**
 * This is the scene hierarchy view to be shown in leftSideWindow.
 */
class HierarchyView extends TreeView {
    constructor(tdModeControlsComp) {
        super(tdModeControlsComp);
    }
    init() {
        this.makeNode(this.tdModeControlsComp.el, -1);

        this.tdModeControlsComp.el.addEventListener('target-attached', (e) => {
            const el = e.detail.el;
            if (this.selectedNodeNum !== -1) {
                this.nodes[this.selectedNodeNum].style.background = 'transparent';
            }
            let nodeNum = this.nodeNumByEl.get(el);
            this.nodes[nodeNum].style.background = '#ff3030';
            this.selectedNodeNum = nodeNum;
            this.spreadOnPath(nodeNum);
        });
        this.tdModeControlsComp.el.addEventListener('target-detached', (e) => {
            if (this.selectedNodeNum !== -1) {
                this.nodes[this.selectedNodeNum].style.background = 'transparent';
                this.selectedNodeNum = -1;
            }
        });
    }
    makeNode(el, parentNum) { //topdown recursive
        if (!el.tagName.startsWith('A-') || el.tagName === 'A-USER' || el.tagName === 'A-TRIGGER' || el.tagName === 'A-FLAG')
            return;

        let node = document.createElement('div');
        node.el = el;
        node.num = this.nextNodeNum++;
        node.innerHTML = "<img src='/img/Transparent.gif'></img> &lt;" + el.tagName + "&gt; " + "#" + el.id;
        const ulEl = document.createElement('ul');
        node.appendChild(ulEl);

        let imgTag = $(node).children('img')[0];
        imgTag.style.height = '20px';
        imgTag.style.width = '20px';
        node.style.webkitTouchCallout = 'none'; // ios safari
        node.style.webkitUserSelect = 'none'; // chrome, safari, opera
        node.style.khtmlUserSelect = 'none'; // Konqueror
        node.style.mozUserSelect = 'none'; // firefox
        node.style.msUserSelect = 'none'; // ie, edge
        node.style.userSelect = 'none'; // ... non prefixed version
        ulEl.style.margin = '0px';
        ulEl.style.display = 'none';

        imgTag.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFoldStatus(node.num);
        });

        node.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.mousedownNodeNum = node.num;
        });

        node.addEventListener('mouseup', (e) => {
            e.stopPropagation();
            if (this.mousedownNodeNum === node.num) {
                if (this.selectedNodeNum !== node.num) {
                    if (this.selectedNodeNum !== -1) {
                        this.nodes[this.selectedNodeNum].style.background = 'transparent';
                        this.tdModeControlsComp.transformControls.detach();
                    }
                    this.selectedNodeNum = node.num;
                    this.nodes[node.num].style.background = '#ff3030';
                    if (node.el.object3D !== undefined && node.el.object3D.type !== 'Scene')
                        this.tdModeControlsComp.transformControls.attach(node.el.object3D);
                }
            }
            else if (this.mousedownNodeNum !== -1) {
                let targetEl = this.nodes[this.mousedownNodeNum].el;
                let newParentEl = node.el;
                let prevParent = targetEl.parentEl;
                this.tdModeControlsComp.hierarchyChange(targetEl, newParentEl, () => {
                    let interactionManagerComp = this.tdModeControlsComp.el.components['interaction-manager'];
                    if (interactionManagerComp)
                        interactionManagerComp.writeInteraction(targetEl, 'hierarchy', prevParent);
                });
            }
            this.mousedownNodeNum = -1;
        });

        this.parents.push(parentNum);
        this.nodes.push(node);
        this.childrens.push(new list());
        this.nodeNumByEl.set(el, node.num);

        if (parentNum !== -1) {
            this.childrens[parentNum].pushBack(node.num);
            let parentNode = this.nodes[parentNum];
            let liEl = document.createElement('li');
            liEl.appendChild(node);
            liEl.style.listStyleType = 'none';
            $(parentNode).children('img')[0].src = '/img/noun_Square plus_620378_000000.png';
            $(parentNode).children('ul')[0].appendChild(liEl);
        }
        else {
            this.view.appendChild(node);
        }

        for (let child of el.children) {
            this.makeNode(child, node.num);
        }

        return node;
    }
};

/**
 * This is the flag-trigger tree view to be shown in leftSideWindow.
 */
class FlagView extends TreeView {
    constructor(tdModeControlsComp) {
        super(tdModeControlsComp);
    }
    init() {
        for (let child of this.tdModeControlsComp.el.children) {
            if (child.tagName === 'A-TRIGGER' || child.tagName === 'A-FLAG') {
                this.makeNode(child, -1);
            }
        }
    }
    makeNode(el, parentNum) {
        if (!(el.tagName === 'A-TRIGGER') && !(el.tagName === 'A-FLAG'))
            return;
        let compName = el.tagName.toLowerCase().substring(2);
        let node = document.createElement('div');
        node.el = el;
        node.num = this.nextNodeNum++;
        node.innerHTML = "<img src='/img/Transparent.gif'></img> &lt;" + el.tagName + "&gt; " + "#" + el.id + "<b></b><img src='/img/flag.png' align='right' style='height:23px;display:none;'></img>";
        const ulEl = document.createElement('ul');
        node.appendChild(ulEl);

        let imgTag = $(node).children('img')[0];
        imgTag.style.height = '20px';
        imgTag.style.width = '20px';
        node.style.webkitTouchCallout = 'none'; // ios safari
        node.style.webkitUserSelect = 'none'; // chrome, safari, opera
        node.style.khtmlUserSelect = 'none'; // Konqueror
        node.style.mozUserSelect = 'none'; // firefox
        node.style.msUserSelect = 'none'; // ie, edge
        node.style.userSelect = 'none'; // ... non prefixed version
        ulEl.style.margin = '0px';
        ulEl.style.display = 'none';

        if (el.hasLoaded) {
            let comp = el.components['flag'] || el.components['trigger'];
            comp.viewNode = node;
            comp.updateView();
        }
        else {
            el.addEventListener('loaded', () => {
                let comp = el.components['flag'] || el.components['trigger'];
                comp.viewNode = node;
                comp.updateView();
            });
        }

        imgTag.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFoldStatus(node.num);
        });

        node.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.selectedNodeNum !== node.num) {
                if (this.selectedNodeNum !== -1) {
                    this.nodes[this.selectedNodeNum].style.background = 'transparent';
                    this.tdModeControlsComp.transformControls.detach();
                }
                this.selectedNodeNum = node.num;
                this.nodes[node.num].style.background = '#ff3030';
            }
        });

        this.parents.push(parentNum);
        this.nodes.push(node);
        this.childrens.push(new list());
        this.nodeNumByEl.set(el, node.num);

        if (parentNum !== -1) {
            this.childrens[parentNum].pushBack(node.num);
            let parentNode = this.nodes[parentNum];
            let liEl = document.createElement('li');
            liEl.appendChild(node);
            liEl.style.listStyleType = 'none';
            $(parentNode).children('img')[0].src = '/img/noun_Square plus_620378_000000.png';
            $(parentNode).children('ul')[0].appendChild(liEl);
        }
        else {
            this.view.appendChild(node);
        }

        for (let child of el.children) {
            this.makeNode(child, node.num);
        }

        return node;
    }
    deselect() {
        if (this.selectedNodeNum !== -1) {
            this.nodes[this.selectedNodeNum].style.background = 'transparent';
        }
        this.selectedNodeNum = -1;
    }
    select(nodeNum) {
        if (this.selectedNodeNum !== nodeNum) {
            this.deselect();
            this.selectedNodeNum = nodeNum;
            this.nodes[nodeNum].style.background = '#ff3030';
        }
    }
};

/**
 * This is the peer view to be shown in leftSideWindow.
 */
class PeerView {
    constructor(tdModeControlsComp) {
        this.tdModeControlsComp = tdModeControlsComp;
        this.view = document.createElement('div');
        this.view.style.overflow = 'auto';
        this.view.innerHTML = "<ul></ul>";
        this.LiByNode = new Map();

        for (let child of tdModeControlsComp.el.children) {
            if (child.tagName === 'A-USER') {
                let liEl = document.createElement('li');
                liEl.style.listStyleType = 'none';
                liEl.innerHTML = child.name;
                $(this.view).children('ul')[0].appendChild(liEl);
                this.LiByNode.set(child, liEl);
            }
        }
    }
};

