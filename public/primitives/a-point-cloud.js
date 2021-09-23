AFRAME.registerPrimitive('a-point-cloud', {
  defaultComponents: {
    "point-cloud": {}
  },

  mappings: {
    src: 'point-cloud.pcd',
    pointSize: 'point-cloud.pointSize',
    pointColor: 'point-cloud.pointColor'
  }
});
