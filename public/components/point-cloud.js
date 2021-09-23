/**
 * This component reads the pcd file and loads the object.
 */

AFRAME.registerComponent('point-cloud', {
  schema: {
    pcd: {type: 'model'},
    pointSize: {type: 'number', default: 0.01},
    pointColor: {type: 'color', default: '#FFF'}
  },

  init: function () {
    this.model = null;
    this.pcdLoader = new THREE.PCDLoader();
  },

  update: function (oldData) {
    var data = this.data;
    if (!data.pcd) { return; }
    if(this.model) {
        if(oldData.pcd === data.pcd) {
            this.model.material.size = data.pointSize;
            this.model.material.color = new THREE.Color(data.pointColor);
			if(!this.el.object3DMap['mesh']) {
				this.el.setObject3D('mesh', this.model);
			}
        }
        else {
            this.resetMesh();
            this.loadObj(data.pcd);
        }
    }
    else {
        this.loadObj(data.pcd);
    }
  },

  remove: function () {
    if (!this.model) { return; }
    this.resetMesh();
  },

  resetMesh: function () {
    this.el.removeObject3D('mesh');
  },

  loadObj: function (pcdUrl) {
    var self = this;
    var el = this.el;
    var pcdLoader = this.pcdLoader;
    var rendererSystem = this.el.sceneEl.systems.renderer;

    pcdLoader.load(pcdUrl, 
        function onLoad (objModel) {
            self.model = objModel;
            el.setObject3D('mesh', objModel);
            self.model.material.size = self.data.pointSize;
            self.model.material.color = new THREE.Color(self.data.pointColor);
            console.log('pcd : ' + self.data.pcd + ' has loaded');
            el.emit('model-loaded', {format: 'pcd', model: objModel});
        },
        function onProgress (xhr) {
            //console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
        },
        function onError (error) {
            console.log( 'An error happened' );
        }
    );
  }
});
