import * as ec2 from '../../../node_modules/aws-cdk-lib/aws-ec2';
import * as rds from '../../../node_modules/aws-cdk-lib/aws-rds';
import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy } from 'aws-cdk-lib';
import * as iam from "../../../node_modules/aws-cdk-lib/aws-iam";
import * as cognito from "../../../node_modules/aws-cdk-lib/aws-cognito";
import { CfnUserPoolResourceServer } from '../../../node_modules/aws-cdk-lib/aws-cognito';
import * as route53 from '../../../node_modules/aws-cdk-lib/aws-route53';
import * as acm from '../../../node_modules/aws-cdk-lib/aws-certificatemanager';
import * as elb2 from '../../../node_modules/aws-cdk-lib/aws-elasticloadbalancingv2';
import * as targets from '../../../node_modules/aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as target from '../../../node_modules/aws-cdk-lib/aws-route53-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import {SqsEventSource} from 'aws-cdk-lib/aws-lambda-event-sources';

export class EngineRayProjectStack extends cdk.Stack {
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
    vpc.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // create a security group for the EC2 instance
    const testec2InstanceSG = new ec2.SecurityGroup(this, 'ec2-instance-sg', {
      vpc,
    });

    testec2InstanceSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'allow SSH connections from anywhere',

      
    );
    
    testec2InstanceSG.addIngressRule(
    ec2.Peer.anyIpv4(),
    ec2.Port.tcp(80), 
    "Allow HTTP traffic from CIDR IPs"
    );
    
    testec2InstanceSG.addIngressRule(
    ec2.Peer.anyIpv4(),
    ec2.Port.tcp(443), 
    "Allow HTTPS traffic from CIDR IPs"
    );
    
    
    
    testec2InstanceSG.applyRemovalPolicy(RemovalPolicy.DESTROY);

    //create the EC2 instance
    
   const testec2Instance = new ec2.Instance(this, 'ec2-instance', {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroup: testec2InstanceSG,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE2,
        ec2.InstanceSize.MICRO,
      ),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      keyName: 'EnginerayKeyPair',
    });
    testec2Instance.applyRemovalPolicy(RemovalPolicy.DESTROY);
      
      
      const role = new iam.Role(this, 'role',{
			assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com'),
		  				
			
		});
	  
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
      //backupRetention: cdk.Duration.days(0),
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      databaseName: 'engineraydb',
      publiclyAccessible: false,
    });
    //dbInstance.applyRemovalPolicy(RemovalPolicy.DESTROY);

    dbInstance.connections.allowFrom(testec2Instance, ec2.Port.tcp(5432));

    new cdk.CfnOutput(this, 'dbEndpoint', {
      value: dbInstance.instanceEndpoint.hostname,
    });

    new cdk.CfnOutput(this, 'secretName', {
      // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
      value: dbInstance.secret?.secretName!,
    });
    
	  
		
    const EngineerUserPool = new cognito.UserPool(this, "enginerayuserpool",{
			
		userPoolName:"engineray-userpool",
		selfSignUpEnabled:true,
		userVerification:{
		  emailStyle:cognito.VerificationEmailStyle.CODE,
		  emailSubject:"Engine Ray email verification",
		  emailBody:
		    "Hey user, Thank you for siging up with engineray here is your verifcation code {####}"
		},
		
	
	  signInAliases: { email: true },
	autoVerify:{email: true},
	signInCaseSensitive:false,
	passwordPolicy:{
	  minLength:8,
	  requireDigits:true,
          requireLowercase:true,
          requireUppercase:true,
	  requireSymbols:true,
         
},
        standardAttributes:{
	   fullname:{
	     required:true,
	},
},
	accountRecovery:cognito.AccountRecovery.EMAIL_ONLY,
	email: cognito.UserPoolEmail.withCognito("info@engineray.com"),
	removalPolicy: cdk.RemovalPolicy.DESTROY,

});
	EngineerUserPool.grant(role,'cognito-idp:AdminCreateUser');
		
	const clientWriteAttributes = new cognito.ClientAttributes()
	   .withStandardAttributes({fullname:true});
		const clientReadAttributes = clientWriteAttributes.withStandardAttributes({
		fullname: true,
		emailVerified: true,
		preferredUsername: true,
});

new CfnUserPoolResourceServer(this, "dev-userpool-resource-server", {
      identifier: "https://resource-server/",
      name: "dev-userpool-resource-server",
      userPoolId: EngineerUserPool.userPoolId,
      scopes: [
        {
          scopeDescription: "Get todo items",
          scopeName: "get-todos",
        },
      ],
    });
	
	const userpoolClient = EngineerUserPool.addClient("app-client",{
	userPoolClientName:"engineray-app-client",
	readAttributes: clientReadAttributes,
	writeAttributes: clientWriteAttributes,
	generateSecret: true,
      oAuth: {
        callbackUrls: [ 'https://3.137.215.196/login.html' ],
        logoutUrls : ['https://3.137.215.196/logout.html'],
        flows: {
          authorizationCodeGrant: true
        },
        scopes: [ cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL ],
        
      }
    });
    
    EngineerUserPool.addDomain("dev-userpool-domain", {
      cognitoDomain: {
        domainPrefix: "engineray-dev-userpool",
      },
    });

	new cdk.CfnOutput(this, "aws_user_pools_id",{
	 value: EngineerUserPool.userPoolId,
});
        new cdk.CfnOutput(this,"aws_user_pools_web_client_id",{
	value: userpoolClient.userPoolClientId,
});




	

 const  domains = 'engineray.online';

   
const testzones = new route53.PublicHostedZone  (this, 'HostedZone',{
      zoneName: domains,
    
});
const  cer  = new acm.Certificate(this, 'Certificate',{
      domainName: domains,
      validation: acm.CertificateValidation.fromDns(testzones),
    });
    const certarn = cer.certificateArn;
    
  
 
/* 
 
const ami = ec2.MachineImage.genericLinux({
                                                 "us-east-2": "ami-0189375cbeafabd08"
                                             })
 const testautoscale = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      vpcSubnets: {
       subnetType: ec2.SubnetType.PUBLIC,
    },
      machineImage: ami,
      associatePublicIpAddress: true
    });
    testautoscale.applyRemovalPolicy(RemovalPolicy.DESTROY);
    */
    
  const Loadbalancersec = new ec2.SecurityGroup(this, 'loadbalSG',{
      vpc: vpc,
      allowAllOutbound: true,
      securityGroupName: 'LoadBalancerSG',
    });
    Loadbalancersec.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP traffic",
      );
      Loadbalancersec.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow HTTPS traffic",
      );
      Loadbalancersec.addEgressRule(
        testec2InstanceSG,
        ec2.Port.tcp(80)
        
        );
  
  const testloadbalancer = new elb2.ApplicationLoadBalancer(this,"apploadbalancer",{
       vpc: vpc,
       internetFacing: true,
       securityGroup:Loadbalancersec,
   //   idleTimeout:Duration.seconds(60),
        
    });
//  const httplist = testloadbalancer.addListener('testhttp',{
//    port: 80,
//    protocol: elb2.ApplicationProtocol.HTTP,
//  });    
    const testlistener = testloadbalancer.addListener('testlist',{
      port:443,
      certificates:[cer],
      protocol: elb2.ApplicationProtocol.HTTPS,
    });
  //
  //httplist.
        
    
    
//  const redirectrule = elb2.ListenerAction.redirect({
//    protocol: 'HTTPS',
//    port: '443',
//  });
    
   // httplistner.
  //  httplistener.{(//addRedirectResponse('HttpToHttpsRedirect', {
  //    statusCode: 'HTTP_301',
  //    protocol: elb2.ApplicationProtocol.HTTPS,
  //    port: '443',
//});
   testlistener.addTargets('testtargets',{
      targets:[new targets.InstanceTarget(testec2Instance)],
      port:80,
    });
    const testcon =  new route53.ARecord(this,'Arecord', {
      zone: testzones,
      target: route53.RecordTarget.fromAlias(new target.LoadBalancerTarget(testloadbalancer)),  
      //target: route53.RecordTarget.fromIpAddresses(testelasticIP.ref),
   
    });
    
  //  httplistener.addTargets('')
//    new CfnOutput(this, 'testladbalancerdnsname',{
  //    value: testloadbalancer.loadBalancerDnsName,
  //  });
    
    /*  const elbcon =  new route53.ARecord(this,'elbrecord', {
       zone:testzones,
       target:route53.RecordTarget.fromAlias(new route53target.LoadBalancerTarget(testloadbalancer)),
       });
//    const EngineerUserpooldomain=new cognito.CfnUserPoolDomain(this, 'EngineerUserPoolDomain',{
  //        userPoolId: EngineerUserPool.userPoolId,
    //      domain:domains,
    //      customDomainConfig: {
    //        certificateArn: certarn,
      //    },
    //});
  const Engineerdomain = testEngineerUserPool.addDomain("dev-userpool-domain", {
      cognitoDomain: {
        domainPrefix: "engineray-online",
      },
      //customDomain: {
      //  certificate: certarn,
    //  }
      
    });*/

    //const cogconrecord = new route53.ARecord(this, 'Engineeruserpooldomainrecord',{
    //  zone: testzones,
    //  recordName:domains,
    //  target:route53.RecordTarget.fromAlias(new target.UserPoolDomainTarget(Engineerdomain)),
    //});

    
/*	new cdk.CfnOutput(this, "aws_user_pools_id",{
	 value: testEngineerUserPool.userPoolId,
});
        new cdk.CfnOutput(this,"aws_user_pools_web_client_id",{
	value: userpoolClient.userPoolClientId,
});*/
    
   
    
  
    
   

//    const targetGroup = new elb2.ApplicationTargetGroup(this, 'MyTargetGroup',{
      //targets: [testec2Instance],
      //targetType:[testelasticIP.ref],
  //    targets:[testautoscale],
  //  });
    //const elbObj = elb.LoadBalancingProtocol;
    //if (elbObj) {
    //  elbObj.instances = [(this.jenkinsInstance.instanceId).toString()];
    //zx}
    //  testloadbalancer.addTarget(InstanceTarget(testec2Instance));
    //const testhttplist = testloadbalancer.addListener("httpListener",{
      //  port:80,
      //  open: true,
        
    //});
  //  const testhttpslist = testloadbalancer.addListener("httpslistener",{
    //    port: 443,
    //    certificates:[{
    //       certificateArn:certarn, 
    //    }],
    //});
    //testloadbalancer.addTarget(loadbalancer.InstanceTarget(testec2Instance));
    //    testhttplist.addTargetGroups('ApplicationSpotFleet', {
    //    targetGroups: [targetGroup],
  //  });
//        testhttpslist.addTargetGroups('ApplicationSpotFleet', {
      //   port: 8080,
  //      targetGroups: [targetGroup],
  //  });*/

     
    
    
    testzones.applyRemovalPolicy(RemovalPolicy.DESTROY);
    cer.applyRemovalPolicy(RemovalPolicy.DESTROY);
    testloadbalancer.applyRemovalPolicy(RemovalPolicy.DESTROY);
      //testautoscale.applyRemovalPolicy(RemovalPolicy.DESTROY);
      //testEngineerUserPool.applyRemovalPolicy(RemovalPolicy.DESTROY);
      
      
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

