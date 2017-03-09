import React, { Component } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
  ScrollView,
  ListView,
  Image, 
  Dimensions,
  Modal,
} from 'react-native';
import RNFS from 'react-native-fs';

import Sound from 'react-native-sound';
import {AudioRecorder, AudioUtils} from 'react-native-audio';

class App extends Component {
	state = {
      currentTime: 0.0,
      recording: false,
      stoppedRecording: false,
      finished: false,
      audioPath: AudioUtils.DocumentDirectoryPath,
      hasPermission: undefined,
      recordedFiles: [],
      displayModal: false,
    };

    componentDidMount() {
    	this.setState({
			dataSource: this.state.dataSource.cloneWithRows(this.state.recordedFiles),
		});

    	this.updateDataSource();

      this._checkPermission().then((hasPermission) => {
        this.setState({ hasPermission });

        if (!hasPermission) return;

        this.prepareRecordingPath();

        AudioRecorder.onProgress = (data) => {
          this.setState({currentTime: Math.floor(data.currentTime)});
        };

        AudioRecorder.onFinished = (data) => {
          // Android callback comes in the form of a promise instead.
          if (Platform.OS === 'ios') {
            this._finishRecording(data.status === "OK", data.audioFileURL);
          }
        };
      });
  	}

  	componentWillMount() {
  		this.getFiles();
		this.createDataSource();
	}

	updateDataSource() {
		RNFS.readDir(AudioUtils.DocumentDirectoryPath)
		.then((result) => {
			this.setState({recordedFiles: result});
			this.setState({
			  dataSource: this.state.dataSource.cloneWithRows(result),
			})
			return Promise.all([RNFS.stat(result[0].path), result[0].path]);
		})
		.catch((err) => {
			console.log(err.message, err.code);
		});
	}

  	createDataSource() {
		const ds = new ListView.DataSource({
			rowHasChanged: (r1, r2) => r1 !== r2
		});

		this.setState({ dataSource: ds.cloneWithRows(this.state.recordedFiles) });
	}

	prepareRecordingPath() {
		const filename = new Date().toISOString().slice(0,10).replace(/-/g,"") + (new Date).toTimeString().slice(0,8).replace(':','').replace(':', '');
		const audioPath = this.state.audioPath + '/'+filename+'.aac'
      AudioRecorder.prepareRecordingAtPath(audioPath, {
        SampleRate: 22050,
        Channels: 1,
        AudioQuality: "Low",
        AudioEncoding: "aac",
        AudioEncodingBitRate: 32000
      });
    }

    _checkPermission() {
      if (Platform.OS !== 'android') {
        return Promise.resolve(true);
      }

      const rationale = {
        'title': 'Microphone Permission',
        'message': 'AudioExample needs access to your microphone so you can record audio.'
      };

      return PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, rationale)
        .then((result) => {
          //console.log('Permission result:', result);
          return (result === true || result === PermissionsAndroid.RESULTS.GRANTED);
        });
    }

	async onRecordPress()  {
		if (this.state.recording) {
			//console.warn('Already recording!');
			return;
		}

		if (!this.state.hasPermission) {
			//console.warn('Can\'t record, no permission granted!');
			return;
		}

		if(this.state.stoppedRecording){
			this.prepareRecordingPath();
		}

		this.setState({recording: true, displayModal: true});

		console.log('modal: ', this.state.recording);

		try {
			const filePath = await AudioRecorder.startRecording();
		} catch (error) {
			console.error(error);
		}
	}

    _finishRecording(didSucceed, filePath) {
      this.setState({ finished: didSucceed });
      this.updateDataSource();
      //console.log(`Finished recording of duration ${this.state.currentTime} seconds at path: ${filePath}`);
    }

	async onPlayPress(filename) {
		if (this.state.recording) {
			await this._stop();
		}

		// These timeouts are a hacky workaround for some issues with react-native-sound.
		// See https://github.com/zmxv/react-native-sound/issues/89.
		setTimeout(() => {
			var sound = new Sound(this.state.audioPath + filename, '', (error) => {
				if (error) {
					//console.log('failed to load the sound', error);
				}
			});

			setTimeout(() => {
				sound.play((success) => {
					if (success) {
						//console.log('successfully finished playing');
					} else {
						//console.log('playback failed due to audio decoding errors');
					}
				});
			}, 100);
		}, 100);
	}

	onPausePress() {
		return;
	}

	async onStopPress() {
		if (!this.state.recording) {
			//console.warn('Can\'t stop, not recording!');
			return;
		}

		this.setState({stoppedRecording: true, recording: false, displayModal: false});

		try {
			const filePath = await AudioRecorder.stopRecording();

			if (Platform.OS === 'android') {
				this._finishRecording(true, filePath);
			}

			return filePath;
		} catch (error) {
			console.error(error);
		}
	}

	getFiles() {
	  RNFS.readDir(AudioUtils.DocumentDirectoryPath)
	  .then((result) => {
	  	this.setState({recordedFiles: result});

	    return Promise.all([RNFS.stat(result[0].path), result[0].path]);
	  })
	  .catch((err) => {
	    console.log(err.message, err.code);
	  });
    }

	onDeleteRecord(filename) {
		const path = RNFS.DocumentDirectoryPath + filename;

		return RNFS.unlink(path)
		.then(() => {
			// console.warn('deleted');
			this.updateDataSource();
		})
		.catch((err) => {
			console.log(err.message);
		});
	}

	renderRow({ name }) {
		return (
			<View style={styles.rowContainer}>
				<Text style={styles.text}>{name}</Text>
				<View>
					<TouchableOpacity style={{ flexDirection: 'row' }} onPress={() => {this.onPlayPress('/'+name)}}>
						<Image style={[styles.smallIcon, { marginRight: 5 }] } source={require('./images/play.png')} />
						<Text style={styles.text}>Play</Text>
					</TouchableOpacity>
					<TouchableOpacity onPress={() => {this.onDeleteRecord('/'+name)}}>
						<Text style={styles.text}>Delete</Text>
					</TouchableOpacity>
				</View>
			</View>
		)
	}

	renderList() {
		if (this.state.recordedFiles && this.state.recordedFiles.length > 0) {
			return (
				<ScrollView style={styles.scrollView}>
					<ListView
					  enableEmptySections
			          dataSource={this.state.dataSource}
			          renderRow={(rowData) => this.renderRow(rowData)}
			        />
				</ScrollView>
			);
		}
		return (
			<Text>No records to show</Text>
		);
	}

	render() {
		const { width, height } = Dimensions.get('window');
		this.state = { 
			...this.state,
			size: { width, height },
		};
		return (
			<Image style={[this.state.size, { marginTop: 20 }]} source={require('./images/record-mic.png')}>
				<View style={styles.shadowContainer}>
					<View style={styles.mainContent}>
						<View style={styles.header}>
							<Text style={styles.text}>
								Simple Recorder App
							</Text>
						</View>
						<View style={styles.listContainer}>
							{this.renderList()}
						</View>
						<View style={styles.recordContainer}>
							<View>
								<TouchableOpacity onPress={() => {this.onRecordPress()}}>
									<Image style={styles.largeIcon} source={require('./images/record.png')} />
									<Text style={styles.textCenter}>Record</Text>
								</TouchableOpacity>
							</View>
						</View>
					</View>
					<Modal
						visible={this.state.displayModal}
						transparent
						animationType="slide"
						onRequestClose={() => {}}
					>
						<View style={styles.modalContainer}>
							<View style={styles.modalContent}>
								<View>
									<TouchableOpacity onPress={() => {this.onStopPress()}}>
										<Image style={styles.largeIcon} source={require('./images/stop.png')} />
										<Text style={styles.textCenter}>Stop</Text>
									</TouchableOpacity>
									<Text style={styles.textCenter}>{this.state.currentTime}s</Text>
								</View>
							</View>
						</View>
					</Modal>
				</View>
			</Image>
		)
	}
}

const styles = StyleSheet.create({
	text: {
		color: '#ddd', 
		fontSize: 18,
	},
	textCenter: {
		color: '#ddd', 
		fontSize: 18, 
		textAlign: 'center',
	},
	rowContainer: {
		margin: 5, 
		flex: 1, 
		flexDirection: 'row', 
		justifyContent: 'space-between',
	},
	scrollView: {
		borderWidth: 1, 
		flex: 1, 
		alignSelf: 'stretch',
	},
	shadowContainer: { 
		flex: 1, 
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
	},
	mainContent: { 
		flex: 1, 
		margin: 10, 
		borderWidth: 1, 
		borderRadius: 10, 
		marginTop: 20, 
		marginBottom: 30, 
		backgroundColor: 'transparent',
	},
	header: {
		flex: 1, 
		alignItems: 'center',
	},
	listContainer: {
		flex: 2, 
		borderWidth: 1, 
		borderRadius: 10, 
		alignItems: 'center',
	},
	recordContainer: {
		flex: 1, 
		flexDirection: 'row', 
		justifyContent: 'center', 
		alignItems: 'center',
	},
	largeIcon: {
		width: 80, 
		height: 80,
	},
	modalContainer: { 
		backgroundColor: 'rgba(0, 0, 0, 0.75)',
		position: 'relative',
		flex: 1,
		justifyContent: 'center',
	},
	modalContent: {
		flex: 1, 
		flexDirection: 'row', 
		justifyContent: 'center', 
		alignItems: 'center',
	},
	smallIcon: {
		width: 15, 
		height: 15,
	}

});

export default App;