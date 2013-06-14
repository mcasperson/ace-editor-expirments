function enableSpellChecking(editor, positiveDictionary, negativeDictionary, negativePhraseDictionary) {

	try {
		console.log("ENTER enableSpellChecking()");

		// Setup the content menu
		var replaceWord = function(original, line, start, end, replacement) {
			var lines = original.split("\n");
			var output = "";
			for (var i = 0, _len = lines.length; i < _len; ++i) {
				if (i != line) {
					output += lines[i] + (i == _len - 1 ? "" : "\n");
				} else {
					output += lines[i].substring(0, start);
					output += replacement;
					output += lines[i].substring(end, lines[i].length) + (i == _len - 1 ? "" : "\n");
				}
			}

			return output;
		}

		// This stops two context menus from being displayed
		var processingSuggestions = false;

		jQuery('#editor').contextMenu(function(cmenu,t,callback) {
			var retValue = [];
			var word = editor.getSession().getValue().split("\n")[this.wordData.line].substring(this.wordData.start, this.wordData.end);
			processingSuggestions = true;

			positiveDictionary.suggest(word, 5, function(wordData) {
				return function(suggestions) {
					processingSuggestions = false;

					if (suggestions.length == 0) {
						var option = {};
						option["No Suggestions"]=function(suggestion, wordData){};
						retValue.push(option);
					} else {
						for (var i = 0, _len = suggestions.length; i < _len; i++) {
							var option = {};
							var suggestion = suggestions[i];
							option[suggestion] = function(suggestion, wordData){
								return function(menuItem,menu){
									var currentScroll = editor.getSession().getScrollTop();
									editor.getSession().setValue(
										replaceWord(
											editor.getSession().getValue(),
											wordData.line,
											wordData.start,
											wordData.end,
											suggestion));
									editor.getSession().setScrollTop(currentScroll);
								};
							}(suggestion, wordData);

							retValue.push(option);
						}
					}

					callback(retValue);

				};
			}(this.wordData));
		}, {theme:'human', beforeShow: function(event) {
			if (!processingSuggestions) {
				var retValue = false;

				this.wordData = {};

				jQuery("div[class^='misspelled'], div[class^='badword']").each(
					function(wordData){
						return function(){
							if (jQuery(this).offset().left <= event.clientX &&
								jQuery(this).offset().left + jQuery(this).width() >= event.clientX &&
								jQuery(this).offset().top <= event.clientY &&
								jQuery(this).offset().top + jQuery(this).height() >= event.clientY) {

								var classAttribute = jQuery(this).attr('class');

								if (classAttribute != null) {

									var matches = /(misspelled|badword)-(\d+)-(\d+)-(\d+)/.exec(classAttribute);
									if (matches != null && matches.length >= 5) {

										retValue = true;

										wordData['line'] = matches[2];
										wordData['start'] = matches[3];
										wordData['end'] = matches[4];
									}
								}

							}
						};
					}(this.wordData));

				return retValue;
			} else {
				return false;
			}
		}});

		var contentsModified = true;

		// Check for changes to the text
		editor.getSession().on('change', function(e) {
			contentsModified = true;
		});

		// Check the spelling of a line, and return [start, end]-pairs for misspelled words.
		var misspelled = function(line) {


			// remove all xml/html elements
			var tagRe = /<.*?>/;
			var tagMatch = null;
			while ((tagMatch = line.match(tagRe)) != null) {
				var tagLength = tagMatch[0].length;
				var replacementString = "";
				for (var i = 0; i < tagLength; ++i) {
					replacementString += " ";
				}
				line = line.replace(tagRe, replacementString);
			}

			// remove all xml/html entities
			var entityRe = /&.*?;/;
			var entityMatch = null;
			while ((entityMatch = line.match(entityRe)) != null) {
				var entityLength = entityMatch[0].length;
				var replacementString = "";
				for (var i = 0; i < entityLength; ++i) {
					replacementString += " ";
				}
				line = line.replace(entityRe, replacementString);
			}

			// remove all urls
			var urlRe = /\b((?:https?:\/\/|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/i;
			var urlMatch = null;
			while ((urlMatch = line.match(urlRe)) != null) {
				var urlLength = urlMatch[0].length;
				var replacementString = "";
				for (var i = 0; i < urlLength; ++i) {
					replacementString += " ";
				}
				line = line.replace(urlRe, replacementString);
			}

			// remove all numbers
			var numberRe = /\b\d+\b/;
			var numberMatch = null;
			while ((numberMatch = line.match(numberRe)) != null) {
				var numberLength = numberMatch[0].length;
				var replacementString = "";
				for (var i = 0; i < numberLength; ++i) {
					replacementString += " ";
				}
				line = line.replace(numberRe, replacementString);
			}

			// replace any character that doesn't make up a word with a space, and then split on space
			var phraseWords = line.split(/\s/);
			var words = line.replace(/[^a-zA-Z0-9'\\-]/g, ' ').split(/\s/);

			var misspelled = [];
			var badWords = [];
			var badPhrases = [];
			var testedWords = [];

			for (var wordIndex = 0, wordCount = phraseWords.length; wordIndex < wordCount; ++wordIndex) {
				testedWords.push(false);
			}

			// How many words can appear in a phrase that will be checked against
			// the dictionaries
			var maxWordsInPhrase = 7;

			outerloop:
				for (var wordGroupIndex = maxWordsInPhrase; wordGroupIndex > 0; --wordGroupIndex) {
					var i = 0;

					// When checking single words, use the words array. Otherwise use the phraseWords array.
					var checkArray =  wordGroupIndex == 1 ? words : phraseWords;

					var lastCheckedWord = 0;

					innerloop:
						for (var wordIndex = 0, wordCount = checkArray.length - wordGroupIndex + 1; wordIndex < wordCount; ++wordIndex) {

							// do this here so the continues down below don't stop us incrementing the value
							var firstWordLengthWithSpace = checkArray[wordIndex].length + 1;
							i += firstWordLengthWithSpace;

							if (wordIndex < lastCheckedWord) {
								continue;
							}

							var checkWord = "";

							for (var checkWordIndex = wordIndex, checkWordIndexMax = wordIndex + wordGroupIndex; checkWordIndex < checkWordIndexMax; ++checkWordIndex) {

								if (testedWords[checkWordIndex]) {
									continue innerloop;
								}

								if (checkArray[checkWordIndex].length == 0) {
									continue innerloop;
								}

								if (checkWordIndex != wordIndex) {
									checkWord += " ";
								}
								checkWord += checkArray[checkWordIndex];
							}

							// skip non word characters at the start and end of the word or phrase
							var match = checkWord.match(/^[^a-zA-Z0-9]+/);
							var startingWhitespace = match != null ? match[0].length : 0;

							var endMatch = checkWord.match(/[^a-zA-Z0-9]+$/);
							var endingWhitespace = endMatch != null ? endMatch[0].length : 0;

							// subtract firstWordLengthWithSpace to account for the fact that it was added
							// at the start of the loop
							var start = i + startingWhitespace - firstWordLengthWithSpace;
							var end = i + checkWord.length - firstWordLengthWithSpace - endingWhitespace;

							if (start < end && checkWord.trim().length != 0) {

								var wordConsumed = false;

								if (negativePhraseDictionary != null && negativePhraseDictionary.check(checkWord.trim())) {
									wordConsumed = true;
									badPhrases[badPhrases.length] = [start, end];
								} else if (negativeDictionary != null && negativeDictionary.check(checkWord.trim())) {
									wordConsumed = true;
									badWords[badWords.length] = [start, end];
								} else if (wordGroupIndex == 1) {
									// check for double words
									if (wordIndex < wordCount - 1 && checkArray[wordIndex+1] == checkWord)  {
										// don't test the next word
										testedWords[wordIndex] = testedWords[wordIndex + 1] = true;
										// this is a bad phrase
										badPhrases[badPhrases.length] = [start, end + checkArray[wordIndex+1].length + 1];
									} else if (!positiveDictionary.check(checkWord.trim())) {
										misspelled[misspelled.length] = [start, end];
									}
								}

								if (wordConsumed) {
									// Words will only fall into one dictionary item. Here we make sure that any words in this negative
									// match don't get used again.
									for (var checkWordIndex = wordIndex, checkWordIndexMax = wordIndex + wordGroupIndex; checkWordIndex < checkWordIndexMax; ++checkWordIndex) {
										testedWords[checkWordIndex] = true;
									}

									lastCheckedWord = wordIndex + wordGroupIndex;
								}
							}
						}
				}

			return {misspelled: misspelled, badWords: badWords, badPhrases: badPhrases};

		}

		var currentlySpellchecking = false;
		var markersPresent = [];

		spellCheck = function() {
			// Wait for the dictionary to be loaded.

			if (currentlySpellchecking) {
				return;
			}

			if (!contentsModified) {
				return;
			}

			console.log("Checking Spelling");

			currentlySpellchecking = true;
			var session = editor.getSession();

			// Clear the markers.
			for (var i in markersPresent) {
				session.removeMarker(markersPresent[i]);
			}
			markersPresent = [];

			try {
				var Range = ace.require('ace/range').Range;
				var lines = session.getDocument().getAllLines();
				for (var i in lines) {
					// Clear the gutter.
					session.removeGutterDecoration(i, "misspelled");

					// Check spelling of this line.
					var misspellings = misspelled(lines[i]);

					// Add markers and gutter markings.
					//if (misspellings.length > 0) {
					//session.addGutterDecoration(i, "misspelled");
					//}
					for (var j in misspellings.misspelled) {
						var range = new Range(i, misspellings.misspelled[j][0], i, misspellings.misspelled[j][1]);

						// Add the information required to identify the misspelled word to the class itself. This
						// gives us a way to go back from a click event to a word.

						markersPresent[markersPresent.length] = session.addMarker(
							range,
							"misspelled-" + i + "-" + misspellings.misspelled[j][0] + "-" + misspellings.misspelled[j][1],
							"typo",
							true);
					}

					for (var j in misspellings.badWords) {
						var range = new Range(i, misspellings.badWords[j][0], i, misspellings.badWords[j][1]);
						markersPresent[markersPresent.length] = session.addMarker(
							range,
							"badword-" + i + "-" + misspellings.badWords[j][0] + "-" + misspellings.badWords[j][1],
							"typo",
							true);
					}

					for (var j in misspellings.badPhrases) {
						var range = new Range(i, misspellings.badPhrases[j][0], i, misspellings.badPhrases[j][1]);
						markersPresent[markersPresent.length] = session.addMarker(
							range,
							"badphrase-" + i + "-" + misspellings.badPhrases[j][0] + "-" + misspellings.badPhrases[j][1],
							"typo",
							true);
					}
				}
			} finally {
				currentlySpellchecking = false;
				contentsModified = false;
			}
		}

		setInterval(spellCheck, 500);
		spellCheck();

	} finally {
		console.log("EXIT enableSpellChecking()");
	}

}