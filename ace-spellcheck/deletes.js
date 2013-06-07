self.addEventListener('message', function(e) { 
	var splits = e.data;

	var deletes = [];

	for (var i = 0, _len = splits.length; i < _len; i++) {
		var s = splits[i];
	
		if (s[1]) {
			deletes.push(s[0] + s[1].substring(1));
		}
	}
	
	postMessage(deletes);
});



