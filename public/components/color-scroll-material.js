/**
 * This component changes the material's color to one of two specific colors. 
 * And the boundary between the two colors is determined by the alignment state of the uv map and the scroll property.
 * By properly aligning the uv map, you can create an animation of one color pushing the other by changing the value of the scroll property.
 */

AFRAME.registerComponent('color-scroll-material', {
    schema: {
        color1: { type: 'color', default: '#00F' },
        color2: { type: 'color', default: '#000' },
        scroll: { type: 'number', default: 0.0, min: 0.0, max: 1.0 },
    },

    init: function () {
        this.materialInitialized = false;

        const mesh = this.el.getObject3D('mesh');
        if (mesh) {
            this.initMaterial();
        } else {
            this.el.addEventListener('model-loaded', (e) => {
                this.initMaterial();
            });
        }
    },

    initMaterial: function () {
        this.mesh = this.el.getObject3D('mesh').children[0];

        this.scrollData = new Float32Array(this.mesh.geometry.attributes.position.count);
        this.mesh.geometry.setAttribute('scroll', new THREE.BufferAttribute(this.scrollData, 1));

        this.mesh.material = new THREE.ShaderMaterial({
            uniforms: {
                color1: { value: new THREE.Color(this.data.color1), type: 'color' },
                color2: { value: new THREE.Color(this.data.color2), type: 'color' },
                scroll: { type: 'number', is: 'attribute', default: 0.0 }
            },
            vertexShader:
                `
                varying vec2 vUv;
                attribute float scroll;
                varying float vScroll;
                void main() {
                    vUv = uv;
                    vScroll = scroll;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                }
            `,
            fragmentShader:
                `
                varying vec2 vUv;
                uniform vec3 color1;
                uniform vec3 color2;
                varying float vScroll;
                void main () {
                    if (vUv.y > vScroll)
                        gl_FragColor = vec4(color1, 1.0);
                    else
                        gl_FragColor = vec4(color2, 1.0);
                }
            `
        });

        this.materialInitialized = true;
        this.scrollChangedHandler();
    },

    update: function (oldData) {
        if (this.materialInitialized && (this.data.color1 !== oldData.color1 || this.data.color2 !== oldData.color2)) {
            this.initMaterial();
        } else if (this.data.scroll !== oldData.scroll) {
            if (this.data.scroll !== '' && this.materialInitialized) {
                this.scrollChangedHandler();
            }
        }
    },

    scrollChangedHandler: function () {
        for (let i = 0; i < this.scrollData.length; i++)
            this.scrollData[i] = this.data.scroll;
        this.mesh.geometry.attributes.scroll.needsUpdate = true;
    }
})