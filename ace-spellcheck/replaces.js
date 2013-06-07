self.addEventListener('message', function(e) { 
	var alphabet = "abcdefghijklmnopqrstuvwxyz";
	var splits = e.data;

	var replaces = [];

	for (var i = 0, _len = splits.length; i < _len; i++) {
		var s = splits[i];
	
		if (s[1]) {
			for (var j = 0, _jlen = alphabet.length; j < _jlen; j++) {
				replaces.push(s[0] + alphabet[j] + s[1].substring(1));
			}
		}
	}
	
	postMessage(replaces);
});




