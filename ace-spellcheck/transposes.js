self.addEventListener('message', function(e) { 
	var splits = e.data;

	var transposes = [];
			
	for (var i = 0, _len = splits.length; i < _len; i++) {
		var s = splits[i];
	
		if (s[1].length > 1) {
			transposes.push(s[0] + s[1][1] + s[1][0] + s[1].substring(2));
		}
	}
	
	postMessage(transposes);
});


