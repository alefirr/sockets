const fs = require('fs');
const net = require('net');
const chalk = require('chalk');

const write = console.log;
const { red, green, cyanBright: cyan, yellow } = chalk;

const LOG_FILE = 'log.txt';

const HOST = 'localhost';
const PORT = 1046;

const getStringFromMessage = (data) => {
	const emptyBytesFrom = data.indexOf(0x00, 1);
	const sliceTo = emptyBytesFrom === -1 ? undefined : emptyBytesFrom;

	return data.subarray(1, sliceTo).toString();
};

const logToFile = async (text) => {
	fs.appendFileSync(LOG_FILE, new Date().toLocaleString() + '  ' + text + '\n');
};

const server = net.createServer((socket) => {
	const sendAndLog = (data) => {
		socket.write(data);
		logToFile(`Sent message     (${data.byteLength} bytes): ${data[0]} | ${getStringFromMessage(data)}`);
	};

	socket.on('data', (data) => {
		let error = null;
		const header = data[0];
		const message = data.subarray(1).toString();

		logToFile(`Received message (${data.byteLength} bytes): ${header} | ${getStringFromMessage(data)}`);

		if (header === 0) {
			if (message === 'hello') {
				sendAndLog(data); // say hello back
			} else if (message === 'who') {
				const [header, info] = [0, 'Olena Olefir, K-25. Variant 21: Ping utility'];
				const whoMessage = Buffer.alloc(info.length + 1);

				whoMessage.writeInt8(header);
				whoMessage.write(info, 1);

				sendAndLog(whoMessage);
			} else {
				error = 'Unknown command: ' + message;
			}
		} else if (header === 1) {
			sendAndLog(data); // echo
		} else {
			error = 'Unknown header: ' + header;
		}

		if (error) {
			const header = 2;
			const errorMessage = Buffer.alloc(error.length + 1);

			errorMessage.writeInt8(header);
			errorMessage.write(error, 1);
			logToFile('Error: ' + error);
			sendAndLog(error);
		}

		let consoleMessage = yellow((new Date()).toLocaleTimeString()) + '  ' +
			cyan('Received message') + ' ' +
			green.bold(`(${data.byteLength} bytes)`) +
			cyan(':') + ' ' +
			header + yellow(' | ') + message;

		if (error) {
			consoleMessage += yellow(' | ') + red('Error: ' + error);
		}

		write(consoleMessage);
	});
});

server.listen(PORT, HOST);
