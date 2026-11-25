window.goatcounter = {
  path: function () {
    return location.pathname + location.search + location.hash;
  }
};

window.addEventListener('hashchange', function () {
  if (window.goatcounter && window.goatcounter.count) {
    window.goatcounter.count({
      path: location.pathname + location.search + location.hash
    });
  }
});
