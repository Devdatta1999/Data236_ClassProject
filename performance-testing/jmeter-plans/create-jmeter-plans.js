/**
 * JMeter Test Plan Generator
 * Creates JMeter XML test plans for Base, Caching, and Kafka scenarios
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'jmeter-plans');
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:3000';
const KAFKA_PROXY_URL = process.env.KAFKA_PROXY_URL || 'http://localhost:3007';

// JMeter XML template structure
function createJMeterTestPlan(scenario, config) {
  const { name, description, users, rampUp, duration, useKafka, useCache } = config;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.2">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${name}" enabled="true">
      <stringProp name="TestPlan.comments">${description}</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.tearDown_on_shutdown">true</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.arguments" elementType="Arguments" guiclass="ArgumentsPanel">
        <collectionProp name="Arguments.arguments">
          <elementProp name="API_GATEWAY_URL" elementType="Argument">
            <stringProp name="Argument.name">API_GATEWAY_URL</stringProp>
            <stringProp name="Argument.value">${API_GATEWAY_URL}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="KAFKA_PROXY_URL" elementType="Argument">
            <stringProp name="Argument.name">KAFKA_PROXY_URL</stringProp>
            <stringProp name="Argument.value">${KAFKA_PROXY_URL}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
        </collectionProp>
      </elementProp>
      <stringProp name="TestPlan.user_define_classpath"></stringProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Performance Test Thread Group" enabled="true">
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControllerGui" testclass="LoopController" testname="Loop Controller" enabled="true">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <intProp name="LoopController.loops">-1</intProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">${users}</stringProp>
        <stringProp name="ThreadGroup.ramp_time">${rampUp}</stringProp>
        <boolProp name="ThreadGroup.scheduler">true</boolProp>
        <stringProp name="ThreadGroup.duration">${duration}</stringProp>
        <stringProp name="ThreadGroup.delay"></stringProp>
        <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
      </ThreadGroup>
      <hashTree>
        ${createCSVDataSetConfig()}
        ${createHTTPRequestDefaults()}
        ${useKafka ? createKafkaRequests() : createHTTPRequests(useCache)}
        ${createListeners()}
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`;
}

function createCSVDataSetConfig() {
  return `
        <CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet" testname="Users CSV Data Set" enabled="true">
          <stringProp name="delimiter">,</stringProp>
          <stringProp name="fileEncoding">UTF-8</stringProp>
          <stringProp name="filename">${path.join(__dirname, '..', 'test-data', 'users.csv')}</stringProp>
          <boolProp name="ignoreFirstLine">true</boolProp>
          <boolProp name="quoted">false</boolProp>
          <boolProp name="recycle">true</boolProp>
          <stringProp name="shareMode">shareMode.all</stringProp>
          <boolProp name="stopThread">false</boolProp>
          <stringProp name="variableNames">userId,email,password,firstName,lastName,phoneNumber,address,city,state,zipCode,ssn</stringProp>
        </CSVDataSet>
        <CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet" testname="Search Queries CSV Data Set" enabled="true">
          <stringProp name="delimiter">,</stringProp>
          <stringProp name="fileEncoding">UTF-8</stringProp>
          <stringProp name="filename">${path.join(__dirname, '..', 'test-data', 'search-queries.csv')}</stringProp>
          <boolProp name="ignoreFirstLine">true</boolProp>
          <boolProp name="quoted">false</boolProp>
          <boolProp name="recycle">true</boolProp>
          <stringProp name="shareMode">shareMode.all</stringProp>
          <boolProp name="stopThread">false</boolProp>
          <stringProp name="variableNames">type,departureAirport,arrivalAirport,departureDate,returnDate,tripType,seatType,numberOfPassengers,city,state,checkInDate,checkOutDate,numberOfRooms,numberOfAdults,starRating,location,pickupDate,dropoffDate,carType,transmissionType</stringProp>
        </CSVDataSet>`;
}

function createHTTPRequestDefaults() {
  return `
        <ConfigTestElement guiclass="HTTPDefaultsGui" testclass="ConfigTestElement" testname="HTTP Request Defaults" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel">
            <collectionProp name="Arguments.arguments"/>
          </elementProp>
          <stringProp name="HTTPSampler.domain">\${API_GATEWAY_URL}</stringProp>
          <stringProp name="HTTPSampler.protocol">http</stringProp>
          <stringProp name="HTTPSampler.contentEncoding"></stringProp>
          <stringProp name="HTTPSampler.path"></stringProp>
          <stringProp name="HTTPSampler.implementation">HttpClient4</stringProp>
          <stringProp name="HTTPSampler.connect_timeout"></stringProp>
          <stringProp name="HTTPSampler.response_timeout"></stringProp>
        </ConfigTestElement>
        <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true">
          <collectionProp name="HeaderManager.headers">
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">Content-Type</stringProp>
              <stringProp name="Header.value">application/json</stringProp>
            </elementProp>
          </collectionProp>
        </HeaderManager>`;
}

function createHTTPRequests(useCache) {
  const cacheHeader = useCache ? `
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">Cache-Control</stringProp>
              <stringProp name="Header.value">max-age=0</stringProp>
            </elementProp>` : '';
  
  return `
        <!-- Login Request -->
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Login" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">{"email":"\${email}","password":"\${password}"}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.domain"></stringProp>
          <stringProp name="HTTPSampler.port"></stringProp>
          <stringProp name="HTTPSampler.protocol"></stringProp>
          <stringProp name="HTTPSampler.contentEncoding"></stringProp>
          <stringProp name="HTTPSampler.path">/api/users/login</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
          <stringProp name="HTTPSampler.embedded_url_re"></stringProp>
          <stringProp name="HTTPSampler.connect_timeout"></stringProp>
          <stringProp name="HTTPSampler.response_timeout"></stringProp>
        </HTTPSamplerProxy>
        <hashTree>
          <JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="Extract Token" enabled="true">
            <stringProp name="JSONPostProcessor.referenceNames">token</stringProp>
            <stringProp name="JSONPostProcessor.jsonPathExpr">$.data.token</stringProp>
            <stringProp name="JSONPostProcessor.match_numbers">-1</stringProp>
            <stringProp name="JSONPostProcessor.defaultValues">NOT_FOUND</stringProp>
            <stringProp name="JSONPostProcessor.compute_concat">false</stringProp>
          </JSONPostProcessor>
        </hashTree>
        
        <!-- Signup Request -->
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Signup" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">{"email":"\${email}","password":"\${password}","firstName":"\${firstName}","lastName":"\${lastName}","userId":"\${userId}","phoneNumber":"\${phoneNumber}","address":"\${address}","city":"\${city}","state":"\${state}","zipCode":"\${zipCode}","ssn":"\${ssn}"}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.path">/api/users/signup</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
        </HTTPSamplerProxy>
        <hashTree/>
        
        <!-- Flight Search Request -->
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Search Flights" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">{"eventType":"search.flights","departureAirport":"\${departureAirport}","arrivalAirport":"\${arrivalAirport}","departureDate":"\${departureDate}","returnDate":"\${returnDate}","tripType":"\${tripType}","seatType":"\${seatType}","numberOfPassengers":"\${numberOfPassengers}"}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.path">/api/listings/flights/search</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
        </HTTPSamplerProxy>
        <hashTree/>
        
        <!-- Hotel Search Request -->
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Search Hotels" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">{"eventType":"search.hotels","city":"\${city}","state":"\${state}","checkInDate":"\${checkInDate}","checkOutDate":"\${checkOutDate}","numberOfRooms":"\${numberOfRooms}","numberOfAdults":"\${numberOfAdults}","starRating":"\${starRating}"}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.path">/api/listings/hotels/search</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
        </HTTPSamplerProxy>
        <hashTree/>
        
        <!-- Car Search Request -->
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Search Cars" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">{"eventType":"search.cars","location":"\${location}","pickupDate":"\${pickupDate}","dropoffDate":"\${dropoffDate}","carType":"\${carType}","transmissionType":"\${transmissionType}"}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.path">/api/listings/cars/search</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
        </HTTPSamplerProxy>
        <hashTree/>`;
}

function createKafkaRequests() {
  return `
        <!-- Kafka Login Request -->
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Kafka Login" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">{"topic":"user-events","event":{"eventType":"user.login","email":"\${email}","password":"\${password}"},"responseTopic":"user-events-response","timeout":30000}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.domain">\${KAFKA_PROXY_URL}</stringProp>
          <stringProp name="HTTPSampler.path">/api/kafka/send</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
        </HTTPSamplerProxy>
        <hashTree>
          <JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="Extract Token from Kafka" enabled="true">
            <stringProp name="JSONPostProcessor.referenceNames">token</stringProp>
            <stringProp name="JSONPostProcessor.jsonPathExpr">$.token</stringProp>
            <stringProp name="JSONPostProcessor.match_numbers">-1</stringProp>
            <stringProp name="JSONPostProcessor.defaultValues">NOT_FOUND</stringProp>
          </JSONPostProcessor>
        </hashTree>
        
        <!-- Kafka Signup Request -->
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Kafka Signup" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">{"topic":"user-events","event":{"eventType":"user.signup","userId":"\${userId}","email":"\${email}","password":"\${password}","firstName":"\${firstName}","lastName":"\${lastName}","phoneNumber":"\${phoneNumber}","address":"\${address}","city":"\${city}","state":"\${state}","zipCode":"\${zipCode}","ssn":"\${ssn}"},"responseTopic":"user-events-response","timeout":30000}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.domain">\${KAFKA_PROXY_URL}</stringProp>
          <stringProp name="HTTPSampler.path">/api/kafka/send</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
        </HTTPSamplerProxy>
        <hashTree/>
        
        <!-- Kafka Flight Search Request -->
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Kafka Search Flights" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">{"topic":"search-events","event":{"eventType":"search.flights","departureAirport":"\${departureAirport}","arrivalAirport":"\${arrivalAirport}","departureDate":"\${departureDate}","returnDate":"\${returnDate}","tripType":"\${tripType}","seatType":"\${seatType}","numberOfPassengers":"\${numberOfPassengers}"},"responseTopic":"search-events-response","timeout":30000}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.domain">\${KAFKA_PROXY_URL}</stringProp>
          <stringProp name="HTTPSampler.path">/api/kafka/send</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
        </HTTPSamplerProxy>
        <hashTree/>
        
        <!-- Kafka Hotel Search Request -->
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Kafka Search Hotels" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">{"topic":"search-events","event":{"eventType":"search.hotels","city":"\${city}","state":"\${state}","checkInDate":"\${checkInDate}","checkOutDate":"\${checkOutDate}","numberOfRooms":"\${numberOfRooms}","numberOfAdults":"\${numberOfAdults}","starRating":"\${starRating}"},"responseTopic":"search-events-response","timeout":30000}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.domain">\${KAFKA_PROXY_URL}</stringProp>
          <stringProp name="HTTPSampler.path">/api/kafka/send</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
        </HTTPSamplerProxy>
        <hashTree/>
        
        <!-- Kafka Car Search Request -->
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Kafka Search Cars" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">{"topic":"search-events","event":{"eventType":"search.cars","location":"\${location}","pickupDate":"\${pickupDate}","dropoffDate":"\${dropoffDate}","carType":"\${carType}","transmissionType":"\${transmissionType}"},"responseTopic":"search-events-response","timeout":30000}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.domain">\${KAFKA_PROXY_URL}</stringProp>
          <stringProp name="HTTPSampler.path">/api/kafka/send</stringProp>
          <stringProp name="HTTPSampler.method">POST</stringProp>
        </HTTPSamplerProxy>
        <hashTree/>`;
}

function createListeners() {
  return `
        <ResultCollector guiclass="SummaryReport" testclass="ResultCollector" testname="Summary Report" enabled="true">
          <boolProp name="ResultCollector.error_logging">false</boolProp>
          <objProp>
            <name>saveConfig</name>
            <value class="SampleSaveConfiguration">
              <time>true</time>
              <latency>true</latency>
              <timestamp>true</timestamp>
              <success>true</success>
              <label>true</label>
              <code>true</code>
              <message>true</message>
              <threadName>true</threadName>
              <dataType>true</dataType>
              <encoding>false</encoding>
              <assertions>true</assertions>
              <subresults>true</subresults>
              <responseData>false</responseData>
              <samplerData>false</samplerData>
              <xml>false</xml>
              <fieldNames>true</fieldNames>
              <responseHeaders>false</responseHeaders>
              <requestHeaders>false</requestHeaders>
              <responseDataOnError>false</responseDataOnError>
              <saveAssertionResultsFailureMessage>true</saveAssertionResultsFailureMessage>
              <assertionsResultsToSave>0</assertionsResultsToSave>
              <bytes>true</bytes>
              <sentBytes>true</sentBytes>
              <url>true</url>
              <threadCounts>true</threadCounts>
              <idleTime>true</idleTime>
              <connectTime>true</connectTime>
            </value>
          </objProp>
          <stringProp name="filename"></stringProp>
        </ResultCollector>
        <hashTree/>
        <ResultCollector guiclass="ViewResultsFullVisualizer" testclass="ResultCollector" testname="View Results Tree" enabled="true">
          <boolProp name="ResultCollector.error_logging">false</boolProp>
          <objProp>
            <name>saveConfig</name>
            <value class="SampleSaveConfiguration">
              <time>true</time>
              <latency>true</latency>
              <timestamp>true</timestamp>
              <success>true</success>
              <label>true</label>
              <code>true</code>
              <message>true</message>
              <threadName>true</threadName>
              <dataType>true</dataType>
              <encoding>false</encoding>
              <assertions>true</assertions>
              <subresults>true</subresults>
              <responseData>false</responseData>
              <samplerData>false</samplerData>
              <xml>false</xml>
              <fieldNames>true</fieldNames>
              <responseHeaders>false</responseHeaders>
              <requestHeaders>false</requestHeaders>
              <responseDataOnError>false</responseDataOnError>
              <saveAssertionResultsFailureMessage>true</saveAssertionResultsFailureMessage>
              <assertionsResultsToSave>0</assertionsResultsToSave>
              <bytes>true</bytes>
              <sentBytes>true</sentBytes>
              <url>true</url>
              <threadCounts>true</threadCounts>
              <idleTime>true</idleTime>
              <connectTime>true</connectTime>
            </value>
          </objProp>
          <stringProp name="filename"></stringProp>
        </ResultCollector>
        <hashTree/>
        <ResultCollector guiclass="StatVisualizer" testclass="ResultCollector" testname="Aggregate Report" enabled="true">
          <boolProp name="ResultCollector.error_logging">false</boolProp>
          <objProp>
            <name>saveConfig</name>
            <value class="SampleSaveConfiguration">
              <time>true</time>
              <latency>true</latency>
              <timestamp>true</timestamp>
              <success>true</success>
              <label>true</label>
              <code>true</code>
              <message>true</message>
              <threadName>true</threadName>
              <dataType>true</dataType>
              <encoding>false</encoding>
              <assertions>true</assertions>
              <subresults>true</subresults>
              <responseData>false</responseData>
              <samplerData>false</samplerData>
              <xml>false</xml>
              <fieldNames>true</fieldNames>
              <responseHeaders>false</responseHeaders>
              <requestHeaders>false</requestHeaders>
              <responseDataOnError>false</responseDataOnError>
              <saveAssertionResultsFailureMessage>true</saveAssertionResultsFailureMessage>
              <assertionsResultsToSave>0</assertionsResultsToSave>
              <bytes>true</bytes>
              <sentBytes>true</sentBytes>
              <url>true</url>
              <threadCounts>true</threadCounts>
              <idleTime>true</idleTime>
              <connectTime>true</connectTime>
            </value>
          </objProp>
          <stringProp name="filename"></stringProp>
        </ResultCollector>
        <hashTree/>`;
}

// Generate test plans
function generateTestPlans() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const scenarios = [
    {
      scenario: 'base',
      config: {
        name: 'Base Performance Test',
        description: 'HTTP requests without caching',
        users: 100,
        rampUp: 10,
        duration: 300, // 5 minutes
        useKafka: false,
        useCache: false
      }
    },
    {
      scenario: 'caching',
      config: {
        name: 'Caching Performance Test',
        description: 'HTTP requests with Redis caching enabled',
        users: 100,
        rampUp: 10,
        duration: 300,
        useKafka: false,
        useCache: true
      }
    },
    {
      scenario: 'kafka',
      config: {
        name: 'Kafka Performance Test',
        description: 'Kafka async event-driven requests',
        users: 100,
        rampUp: 10,
        duration: 300,
        useKafka: true,
        useCache: false
      }
    }
  ];
  
  scenarios.forEach(({ scenario, config }) => {
    const xml = createJMeterTestPlan(scenario, config);
    const filename = `jmeter-${scenario}-performance.jmx`;
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), xml);
    console.log(`Generated ${filename}`);
  });
  
  console.log('\nJMeter test plans generated successfully!');
}

if (require.main === module) {
  generateTestPlans();
}

module.exports = { generateTestPlans, createJMeterTestPlan };



