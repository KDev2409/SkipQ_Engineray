import json
import boto3

s3 = boto3.client('s3')

def lambda_handler(event, context):
	bucket ='PaySlipBucket'

	transactionToUpload = {}
	transactionToUpload['emplyeeId'] = 'EID-001'
	transactionToUpload['paymenttype'] = 'Cheque'
	transactionToUpload['amount'] = 2000
	transactionToUpload['companyId'] = 'CID-001'

	fileName = 'CID-001PaySlip' + '.json'

	uploadByteStream = bytes(json.dumps(transactionToUpload).encode('UTF-8'))

	s3.put_object(Bucket=bucket, Key=fileName, Body=uploadByteStream)

	print('Put Complete')
