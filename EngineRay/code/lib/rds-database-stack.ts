import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import {SqsEventSource} from 'aws-cdk-lib/aws-lambda-event-sources';
import { RemovalPolicy } from 'aws-cdk-lib';

export class RDSDatabaseStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC creation
    const vpc = new ec2.Vpc(this, 'my-cdk-vpc', {
      cidr: '10.0.0.0/16',
      natGateways: 1,
      maxAzs: 3,
      subnetConfiguration: [
        {
          name: 'public-subnet-1',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'private-subnet-1',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });
    //vpc.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // create a security group for the EC2 instance
    const ec2InstanceSG = new ec2.SecurityGroup(this, 'ec2-instance-sg', {
      vpc,
    });

    ec2InstanceSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'allow SSH connections from anywhere',

      
    );
    
    ec2InstanceSG.addIngressRule(
    ec2.Peer.anyIpv4(),
    ec2.Port.tcp(80), 
    "Allow HTTP traffic from CIDR IPs"
    );
    
    ec2InstanceSG.addIngressRule(
    ec2.Peer.anyIpv4(),
    ec2.Port.tcp(443), 
    "Allow HTTPS traffic from CIDR IPs"
    );
    
    
    
    //ec2InstanceSG.applyRemovalPolicy(RemovalPolicy.DESTROY);

    //create the EC2 instance
    const ec2Instance = new ec2.Instance(this, 'ec2-instance', {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroup: ec2InstanceSG,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE2,
        ec2.InstanceSize.MICRO,
      ),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      keyName: 'EnginerayKeyPair',
    });
    //ec2Instance.applyRemovalPolicy(RemovalPolicy.DESTROY);
    
    /*
    // create RDS instance
    const dbInstance = new rds.DatabaseInstance(this, 'engineray-db-instance', {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_14_6,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO,
      ),
      credentials: rds.Credentials.fromGeneratedSecret('postgres'),
      multiAz: false,
      allocatedStorage: 100,
      maxAllocatedStorage: 120,
      allowMajorVersionUpgrade: false,
      autoMinorVersionUpgrade: true,
      backupRetention: cdk.Duration.days(0),
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      databaseName: 'engineraydb',
      publiclyAccessible: false,
    });
    //dbInstance.applyRemovalPolicy(RemovalPolicy.DESTROY);

    dbInstance.connections.allowFrom(ec2Instance, ec2.Port.tcp(5432));

    new cdk.CfnOutput(this, 'dbEndpoint', {
      value: dbInstance.instanceEndpoint.hostname,
    });

    new cdk.CfnOutput(this, 'secretName', {
      // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
      value: dbInstance.secret?.secretName!,
    });
    */
    /*
    
    const ami = ec2.MachineImage.genericLinux({
                                                 "us-east-2": "ami-04161ab6b596d7749"
                                             })
   
    

    const asg = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      vpcSubnets: {
       subnetType: ec2.SubnetType.PUBLIC,
    },
      machineImage: ami,
    });
    asg.applyRemovalPolicy(RemovalPolicy.DESTROY);
    
    
    const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc,
      internetFacing: true
    });
    lb.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const listener = lb.addListener('Listener', {
      port: 80,
    });
    
    listener.addTargets('Target', {
      port: 80,
      targets: [asg]
      
    });

    listener.connections.allowDefaultPortFromAnyIpv4('Open to the world');

    asg.scaleOnRequestCount('AModestLoad', {
      targetRequestsPerMinute: 60,
    });
    
    */
    
    const function_name = 'Engineray_PaySlip-lambda';
    const lambda_path = './resources';
    
    // need to make changes to this lambda environment in order for it to write to rds tables, refer bookmarks
      const lambda1 = new lambda.Function(this, function_name,{
      functionName: function_name,
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.Code.fromAsset(lambda_path),
      handler:"PaySlip.lambda_handler"
      
    });
    lambda1.applyRemovalPolicy(RemovalPolicy.DESTROY);
    
    const bucket = new s3.Bucket(this, 'PaySlipBucketEngineRay');
    bucket.applyRemovalPolicy(RemovalPolicy.DESTROY);
    
    // create queue
    const queue = new sqs.Queue(this, 'sqs-queue');

    // create sns topic
    const topic = new sns.Topic(this, 'sns-topic');

    // subscribe queue to topic
    topic.addSubscription(new subs.SqsSubscription(queue));

    new cdk.CfnOutput(this, 'snsTopicArn', {
      value: topic.topicArn,
      description: 'The arn of the SNS topic',
    });
    
   lambda1.addEventSource(
      new SqsEventSource(queue, {
        batchSize: 10,
      }),
    );
    
    const payslipbucket = new s3.Bucket(this, 'PaySlipBucket');
    bucket.applyRemovalPolicy(RemovalPolicy.DESTROY);
    
    payslipbucket.grantWrite(lambda1);
    
  }
}
