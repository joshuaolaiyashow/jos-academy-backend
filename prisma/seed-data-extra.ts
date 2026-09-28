import {
  code,
  note,
  unsplash,
  type SeedCourse,
  type SeedLesson,
  type SeedLiveSession,
} from './seed-data';

export const EXTRA_CATEGORIES: { name: string; description: string }[] = [
  {
    name: 'Data Science',
    description:
      'Data analysis, visualisation, and statistical thinking with Python.',
  },
  {
    name: 'Cybersecurity',
    description:
      'Defensive security, threat modelling, and secure engineering practice.',
  },
];

/** Additional lessons appended to existing modules, keyed by module title. */
export const EXTRA_LESSONS: Record<string, SeedLesson[]> = {
  'Module 1: HTML, CSS & Responsive Design': [
    note(
      'Mobile-first responsive design',
      'Write base styles for the smallest screen and add min-width media queries as space grows. This keeps CSS smaller and avoids overriding desktop rules.',
      25,
    ),
    code(
      'Fluid typography with clamp()',
      'h1 {\n  font-size: clamp(1.75rem, 1.2rem + 2vw, 3rem);\n}',
      15,
    ),
  ],
  'Module 2: Modern JavaScript & TypeScript Fundamentals': [
    code(
      'Array methods: map, filter, reduce',
      'const total = orders\n  .filter((order) => order.paid)\n  .map((order) => order.amount)\n  .reduce((sum, amount) => sum + amount, 0);',
      25,
    ),
    note(
      'Modules and tooling',
      'ES modules give each file its own scope with explicit imports and exports. A bundler and a strict tsconfig catch mistakes before they reach users.',
      20,
    ),
  ],
  'Module 3: Backend Architecture with NestJS & Express': [
    code(
      'Writing a REST controller',
      "@Controller('courses')\nexport class CourseController {\n  constructor(private readonly courses: CourseService) {}\n\n  @Get(':id')\n  findOne(@Param('id') id: string) {\n    return this.courses.findOne(id);\n  }\n}",
      30,
    ),
    note(
      'Handling errors consistently',
      'Throw framework exceptions from services and let a global filter shape the response as a message and a code. Never leak stack traces to clients.',
      20,
    ),
  ],
  'Module 4: Database Modeling with PostgreSQL & Prisma': [
    note(
      'Indexes and query performance',
      'Index columns used in filters, joins, and sorts. Read the query plan before adding one, because every index slows writes and uses storage.',
      25,
    ),
    code(
      'Avoiding N+1 queries',
      'const courses = await prisma.course.findMany({\n  include: { modules: { include: { lessons: true } } },\n});',
      20,
    ),
  ],
  'Module 5: Fullstack Deployment & DevOps Basics': [
    note(
      'Environment configuration and secrets',
      'Configuration that differs between environments belongs in environment variables. Validate them at startup so a missing secret fails fast instead of at 2 a.m.',
      20,
    ),
    note(
      'Monitoring and logging',
      'Emit structured JSON logs with a request id, track error rate and latency, and alert on symptoms users feel rather than on every internal metric.',
      25,
    ),
  ],
  'Module 1: How Robots Work': [
    note(
      'Robot anatomy: chassis, drivetrain, brain',
      'A robot is a mechanical structure, actuators that move it, sensors that observe it, and a controller that ties them together. Weight and centre of gravity shape every later decision.',
      20,
    ),
    note(
      'Reading a circuit diagram',
      'Follow power from the source through switches and loads back to ground. Label every rail and check polarity before applying power.',
      20,
    ),
  ],
  'Module 2: Sensors and Signals': [
    note(
      'Line, light and colour sensors',
      'Reflective infrared sensors measure how much light bounces back from the surface, which is how a robot tells a dark line from a light floor.',
      20,
    ),
    code(
      'Calibrating a light sensor',
      'int lo = 1023, hi = 0;\nfor (int i = 0; i < 200; i++) {\n  int v = analogRead(A0);\n  lo = min(lo, v); hi = max(hi, v);\n  delay(10);\n}',
      20,
    ),
  ],
  'Module 3: Control and Your First Robot': [
    note(
      'Adding an integral and derivative term',
      'The integral term removes steady offset and the derivative term damps overshoot. Add them one at a time and only if proportional control is not enough.',
      25,
    ),
    note(
      'Capstone: the line-following challenge',
      'Build a robot that completes a taped track with turns. Record your best lap time and the gain values that produced it.',
      40,
    ),
  ],
  'Module 1: Registers, GPIO and Timers': [
    code(
      'Reading a digital input',
      'DDRD &= ~(1 << PD2);   // input\nPORTD |= (1 << PD2);    // pull-up\nbool pressed = !(PIND & (1 << PD2));',
      20,
    ),
    note(
      'Clock sources and power modes',
      'The clock speed sets how fast code runs and how much power the chip draws. Sleep modes let battery devices spend most of their time nearly off.',
      25,
    ),
  ],
  'Module 2: Interrupts and Concurrency': [
    note(
      'Priorities and nested interrupts',
      'When two interrupts arrive together, the higher priority runs first. Avoid nesting unless you have measured the latency you need.',
      20,
    ),
    code(
      'A cooperative scheduler in twenty lines',
      'struct Task { void (*run)(); uint32_t period, last; };\nvoid tick(Task* t, int n, uint32_t now) {\n  for (int i = 0; i < n; i++)\n    if (now - t[i].last >= t[i].period) { t[i].last = now; t[i].run(); }\n}',
      30,
    ),
  ],
  'Module 3: Serial Buses and Peripherals': [
    note(
      'Logic levels and level shifting',
      'A 3.3 V chip can be damaged by a 5 V signal. Use a level shifter or a divider whenever two devices run at different voltages.',
      20,
    ),
    code(
      'Logging over UART',
      'Serial.begin(115200);\nSerial.print("temp=");\nSerial.println(readTemperature());',
      15,
    ),
  ],
  'Module 1: Aerodynamics': [
    note(
      'Boundary layers and drag',
      'Air sticks to the surface and forms a thin layer whose behaviour drives friction drag. A turbulent layer resists separation better than a laminar one.',
      25,
    ),
    note(
      'Reading an airfoil polar',
      'A polar plots lift and drag against angle of attack. The peak of the lift curve marks the stall angle, and the best lift-to-drag ratio marks the most efficient cruise.',
      25,
    ),
  ],
  'Module 2: Flight Mechanics and Stability': [
    note(
      'Performance: climb, glide, and range',
      'Excess thrust gives climb rate, and the best glide angle depends only on lift-to-drag ratio. Range and endurance peak at different speeds.',
      25,
    ),
    code(
      'Estimating stall speed',
      'import math\n\ndef stall_speed(weight, rho, area, cl_max):\n    return math.sqrt(2 * weight / (rho * area * cl_max))',
      20,
    ),
  ],
  'Module 3: Propulsion': [
    note(
      'Propellers and momentum theory',
      'A propeller accelerates a large mass of air by a small amount, which is more efficient than a small mass by a large amount. That is why bigger, slower props win at low speed.',
      25,
    ),
    note(
      'Chemical versus electric propulsion',
      'Chemical rockets give high thrust but modest efficiency; electric thrusters give tiny thrust at very high efficiency, suiting long deep-space burns.',
      25,
    ),
  ],
  'Module 1: Orbital Mechanics': [
    note(
      'Orbital elements',
      'Six elements fully describe an orbit: size, shape, inclination, node, argument of periapsis, and position along the orbit.',
      30,
    ),
    code(
      'Converting state vectors to elements',
      'h = np.cross(r, v)\nenergy = v @ v / 2 - mu / np.linalg.norm(r)\na = -mu / (2 * energy)',
      30,
    ),
  ],
  'Module 2: Attitude Dynamics': [
    note(
      'Gravity gradient and other disturbance torques',
      'Gravity gradient, solar pressure, magnetic torque, and drag all push on a spacecraft. The dominant one depends on altitude and shape.',
      30,
    ),
    code(
      'Integrating a quaternion',
      'def integrate(q, omega, dt):\n    dq = 0.5 * quat_mult(q, np.r_[0, omega]) * dt\n    q = q + dq\n    return q / np.linalg.norm(q)',
      30,
    ),
  ],
  'Module 3: Control Design': [
    note(
      'Sensors: star trackers and gyros',
      'Gyros give fast but drifting rate data; star trackers give absolute but slower attitude. A filter combines them for an estimate better than either.',
      30,
    ),
    note(
      'Capstone: slew and hold simulation',
      'Simulate a 90-degree slew with reaction wheel limits and disturbance torques. Report settling time, pointing error, and peak wheel speed.',
      45,
    ),
  ],
  'Module 1: Data and Linear Models': [
    note(
      'Train, validation and test splits',
      'Split the data before doing anything else. Use the training set to fit, the validation set to choose, and the test set once, to report.',
      20,
    ),
    code(
      'Loading and exploring a dataset',
      'import pandas as pd\n\ndf = pd.read_csv("housing.csv")\nprint(df.describe())\nprint(df.isna().sum())',
      20,
    ),
  ],
  'Module 2: Classification': [
    code(
      'Plotting a confusion matrix',
      'from sklearn.metrics import ConfusionMatrixDisplay\n\nConfusionMatrixDisplay.from_estimator(clf, X_test, y_test)',
      15,
    ),
    note(
      'Handling imbalanced classes',
      'When one class is rare, resample, reweight the loss, or change the decision threshold. Judge the result with precision and recall, not accuracy.',
      25,
    ),
  ],
  'Module 3: Evaluation and Generalisation': [
    note(
      'Feature importance and interpretation',
      'Permutation importance shows which inputs the model relies on. Use it to catch leaks and to explain results to non-technical stakeholders.',
      25,
    ),
    note(
      'Capstone: predict and explain',
      'Choose a dataset, build a baseline and a stronger model, and write a one-page report with metrics, error analysis, and limitations.',
      45,
    ),
  ],
  'Module 1: Tensors and Autograd': [
    code(
      'Building a model with nn.Module',
      'class MLP(nn.Module):\n    def __init__(self):\n        super().__init__()\n        self.net = nn.Sequential(nn.Linear(784, 128), nn.ReLU(), nn.Linear(128, 10))\n\n    def forward(self, x):\n        return self.net(x)',
      25,
    ),
    note(
      'Datasets and DataLoaders',
      'A Dataset returns one example; a DataLoader batches, shuffles, and loads in parallel. Shuffle training data and never shuffle evaluation data.',
      20,
    ),
  ],
  'Module 2: Convolutional Networks': [
    note(
      'Transfer learning',
      'Start from a network pretrained on a large dataset, freeze the early layers, and train a new head. It needs far less data and time than training from scratch.',
      25,
    ),
    code(
      'Fine-tuning a pretrained ResNet',
      'model = torchvision.models.resnet18(weights="DEFAULT")\nfor p in model.parameters():\n    p.requires_grad = False\nmodel.fc = nn.Linear(model.fc.in_features, num_classes)',
      30,
    ),
  ],
  'Module 3: Training That Works': [
    note(
      'Saving, loading and deploying models',
      'Save the state dict rather than the whole object, record the code version with it, and export to a portable format for serving.',
      20,
    ),
    note(
      'Capstone: train an image classifier',
      'Train a classifier on a dataset of your choice, log training curves, and compare a scratch model with a fine-tuned one.',
      45,
    ),
  ],
};

export const EXTRA_COURSES: SeedCourse[] = [
  {
    name: 'Python for Data Analysis',
    category: 'Data Science',
    shortDescription:
      'Clean, explore, and visualise real datasets with pandas and matplotlib.',
    fullDescription:
      'A practical first course in data analysis. You will load messy data, clean it, summarise it, and turn it into clear charts, working with real datasets from start to finish in Python.',
    duration: 6,
    durationType: 'weeks',
    targetLevel: 'Foundation',
    maxCohortSize: 50,
    tuitionFee: 18000,
    heroImageName: unsplash('photo-1551288049-bebda4e38f71'),
    modules: [
      {
        title: 'Module 1: Python and pandas Essentials',
        description: 'Core Python and the DataFrame.',
        lessons: [
          note(
            'Why Python for data',
            'Python pairs a readable language with libraries for arrays, tables, and plotting. That combination lets one person go from raw file to finished chart.',
            15,
          ),
          code(
            'Series and DataFrames',
            'import pandas as pd\n\ndf = pd.DataFrame({"city": ["Lagos", "Abuja"], "pop": [15.4, 3.6]})\nprint(df["pop"].mean())',
            20,
          ),
          code(
            'Selecting and filtering rows',
            'big = df[df["pop"] > 5]\nsubset = df.loc[:, ["city", "pop"]]',
            20,
          ),
          note(
            'Reading data from files',
            'Read CSV and Excel with pandas and always inspect the first rows, the types, and the missing values before doing any analysis.',
            15,
          ),
        ],
      },
      {
        title: 'Module 2: Cleaning and Transforming Data',
        description: 'Turning messy data into something reliable.',
        lessons: [
          note(
            'Missing values',
            'Decide whether to drop, fill, or flag missing values based on why they are missing. Never fill silently without recording what you did.',
            20,
          ),
          code(
            'Fixing types and duplicates',
            'df["date"] = pd.to_datetime(df["date"], errors="coerce")\ndf = df.drop_duplicates(subset=["order_id"])',
            20,
          ),
          code(
            'Group, aggregate and merge',
            'summary = df.groupby("region")["sales"].agg(["sum", "mean"])\nfull = orders.merge(customers, on="customer_id", how="left")',
            25,
          ),
          note(
            'Outliers',
            'An outlier may be an error or the most interesting row in the data. Investigate before removing, and document every removal.',
            15,
          ),
        ],
      },
      {
        title: 'Module 3: Visualising and Communicating',
        description: 'Charts that answer questions.',
        lessons: [
          code(
            'Charts with matplotlib',
            'import matplotlib.pyplot as plt\n\nax = df.plot(x="month", y="sales", kind="line")\nax.set_ylabel("Sales (NGN)")\nplt.show()',
            25,
          ),
          note(
            'Choosing the right chart',
            'Use lines for trends, bars for comparisons, and scatter plots for relationships. Remove anything that does not help the reader see the point.',
            15,
          ),
          note(
            'Telling the story',
            'Lead with the finding, support it with one or two charts, and state the caveat. A clear sentence beats a dashboard nobody reads.',
            15,
          ),
          note(
            'Capstone: analyse a public dataset',
            'Pick a public dataset, ask three questions, and answer them with cleaned data and charts in a short notebook.',
            45,
          ),
        ],
      },
    ],
  },
  {
    name: 'Cybersecurity Essentials',
    category: 'Cybersecurity',
    shortDescription:
      'Threats, defences, and secure habits for developers and IT teams.',
    fullDescription:
      'Learn how attackers think and how to defend against them. The course covers the security fundamentals every engineer needs: threat modelling, authentication, common web vulnerabilities, and incident response.',
    duration: 8,
    durationType: 'weeks',
    targetLevel: 'Foundation',
    maxCohortSize: 40,
    tuitionFee: 22000,
    heroImageName: unsplash('photo-1550751827-4bd374c3f58b'),
    modules: [
      {
        title: 'Module 1: Security Foundations',
        description: 'Core concepts and threat modelling.',
        lessons: [
          note(
            'The CIA triad',
            'Confidentiality keeps data secret, integrity keeps it correct, and availability keeps it reachable. Every control protects at least one of the three.',
            15,
          ),
          note(
            'Threat modelling with STRIDE',
            'Walk each component and ask how it could be spoofed, tampered with, repudiated, disclosed, denied, or elevated. Rank risks by likelihood and impact.',
            25,
          ),
          note(
            'Attack surface and least privilege',
            'Every exposed port, endpoint, and permission is attack surface. Give each user and service only the access it needs and nothing more.',
            20,
          ),
          note(
            'Social engineering',
            'People are the easiest target. Phishing, pretexting, and urgency tricks bypass technical controls, so training and verification steps matter.',
            20,
          ),
        ],
      },
      {
        title: 'Module 2: Authentication and Cryptography',
        description: 'Proving identity and protecting data.',
        lessons: [
          note(
            'Password storage',
            'Never store passwords in plain text. Hash them with a slow, salted algorithm such as bcrypt or Argon2 so stolen hashes are expensive to crack.',
            20,
          ),
          code(
            'Hashing and verifying with bcrypt',
            'const hash = await bcrypt.hash(password, 12);\nconst ok = await bcrypt.compare(input, hash);',
            15,
          ),
          note(
            'Multi-factor authentication',
            'A second factor stops most credential-stuffing attacks. Prefer app-based or hardware factors over SMS where possible.',
            15,
          ),
          note(
            'Symmetric, asymmetric and TLS',
            'Symmetric keys encrypt bulk data quickly, asymmetric keys exchange secrets and sign messages, and TLS combines both to protect traffic in transit.',
            25,
          ),
        ],
      },
      {
        title: 'Module 3: Securing Applications',
        description: 'Common web vulnerabilities and how to prevent them.',
        lessons: [
          note(
            'The OWASP Top 10',
            'The list captures the most common web risks, from broken access control to injection. Use it as a checklist during design and review.',
            25,
          ),
          code(
            'Preventing SQL injection',
            '// Unsafe: string concatenation\n// db.query("SELECT * FROM users WHERE id = " + id);\n\n// Safe: parameterised query\nawait db.query("SELECT * FROM users WHERE id = $1", [id]);',
            20,
          ),
          note(
            'Cross-site scripting and CSRF',
            'Escape untrusted output to stop XSS, and use same-site cookies or anti-forgery tokens to stop CSRF. Add a strict content security policy.',
            25,
          ),
          note(
            'Incident response basics',
            'Prepare a plan before you need it: detect, contain, eradicate, recover, and review. Keep logs long enough to reconstruct what happened.',
            25,
          ),
        ],
      },
    ],
  },
  {
    name: 'Computer Vision for Robots',
    category: 'Robotics',
    shortDescription:
      'Give robots sight: cameras, image processing, and object detection.',
    fullDescription:
      'An advanced course on machine vision for robotics. You will calibrate cameras, process images with OpenCV, detect and track objects, and connect what a robot sees to what it does.',
    duration: 3,
    durationType: 'Months',
    targetLevel: 'Advanced',
    maxCohortSize: 20,
    tuitionFee: 45000,
    heroImageName: unsplash('photo-1561144257-e32e8efc6c4f'),
    modules: [
      {
        title: 'Module 1: Image Fundamentals',
        description: 'Cameras, pixels, and calibration.',
        lessons: [
          note(
            'How cameras form images',
            'A pinhole model maps 3D points onto a 2D sensor. Focal length and sensor size determine the field of view and the scale of everything in the frame.',
            25,
          ),
          code(
            'Loading and filtering images with OpenCV',
            'import cv2\n\nimg = cv2.imread("frame.png")\ngray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)\nblur = cv2.GaussianBlur(gray, (5, 5), 0)',
            25,
          ),
          note(
            'Camera calibration',
            'Photograph a checkerboard from many angles to estimate the intrinsic matrix and lens distortion, then undistort every frame before measuring anything.',
            30,
          ),
          note(
            'Colour spaces and lighting',
            'HSV separates colour from brightness, which makes thresholding more robust to changing light than raw RGB.',
            20,
          ),
        ],
      },
      {
        title: 'Module 2: Detection and Tracking',
        description: 'Finding and following objects.',
        lessons: [
          code(
            'Edges and contours',
            'edges = cv2.Canny(blur, 50, 150)\ncontours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)',
            25,
          ),
          note(
            'Feature matching',
            'Keypoint detectors find distinctive corners and blobs, and descriptors let you match them between frames for tracking and mapping.',
            30,
          ),
          note(
            'Object detection with neural networks',
            'Detectors such as YOLO predict boxes and classes in one pass. Choose a model size that meets your robot frame-rate budget.',
            30,
          ),
          code(
            'Tracking with a Kalman filter',
            'kf = cv2.KalmanFilter(4, 2)\nkf.predict()\nkf.correct(np.array([[x], [y]], np.float32))',
            30,
          ),
        ],
      },
      {
        title: 'Module 3: Vision-Guided Robots',
        description: 'From pixels to actions.',
        lessons: [
          note(
            'Visual servoing',
            'Steer the robot so that a feature moves toward a target position in the image. The camera becomes the sensor in the control loop.',
            30,
          ),
          note(
            'Estimating depth',
            'Stereo pairs, structured light, and time-of-flight sensors each trade range, accuracy, and cost. Match the sensor to the task.',
            30,
          ),
          note(
            'Latency and real-time constraints',
            'Total delay from exposure to actuation limits how fast a robot can react. Measure it end to end and budget every stage.',
            25,
          ),
          note(
            'Capstone: pick and place with vision',
            'Detect an object on a table, compute its position, and command an arm or gripper to pick it up. Report success rate over twenty trials.',
            60,
          ),
        ],
      },
    ],
  },
  {
    name: 'Drone Design and Flight Control',
    category: 'Aerospace',
    shortDescription: 'Design a multirotor and tune its flight controller.',
    fullDescription:
      'Build the theory and the practice of small unmanned aircraft. You will size motors and propellers, estimate flight time, and tune the stabilisation loops that keep a multirotor in the air.',
    duration: 10,
    durationType: 'weeks',
    targetLevel: 'Intermediate',
    maxCohortSize: 25,
    tuitionFee: 35000,
    heroImageName: unsplash('photo-1473968512647-3e447244af8f'),
    modules: [
      {
        title: 'Module 1: Multirotor Design',
        description: 'Sizing a vehicle that can actually fly.',
        lessons: [
          note(
            'How a quadcopter flies',
            'Four rotors give thrust and torque. Changing the speed of opposite pairs pitches, rolls, and yaws the vehicle without any moving surfaces.',
            20,
          ),
          note(
            'Choosing motors and propellers',
            'Match motor KV to prop size and battery voltage, and check the thrust table. Aim for a thrust-to-weight ratio of at least two.',
            25,
          ),
          code(
            'Estimating hover time',
            'def hover_minutes(capacity_mah, voltage, power_w):\n    energy_wh = capacity_mah / 1000 * voltage\n    return energy_wh / power_w * 60 * 0.8',
            20,
          ),
          note(
            'Frame, weight and balance',
            'Keep the centre of gravity at the geometric centre. A well-balanced, stiff frame makes tuning far easier.',
            20,
          ),
        ],
      },
      {
        title: 'Module 2: Sensing and Estimation',
        description: 'Knowing attitude and position.',
        lessons: [
          note(
            'IMUs and complementary filters',
            'Gyros are smooth but drift and accelerometers are noisy but stable. A complementary filter blends them into a clean attitude estimate.',
            25,
          ),
          code(
            'A complementary filter',
            'angle = 0.98 * (angle + gyro_rate * dt) + 0.02 * accel_angle',
            15,
          ),
          note(
            'GPS, barometer and magnetometer',
            'Each sensor covers a weakness of the others. Fuse them, and always plan for what the vehicle does when one fails.',
            25,
          ),
          note(
            'Vibration and sensor noise',
            'Motor vibration corrupts the IMU. Soft-mount the flight controller and use notch filters tuned to the motor frequency.',
            20,
          ),
        ],
      },
      {
        title: 'Module 3: Flight Control and Tuning',
        description: 'Stabilise, tune, and fly safely.',
        lessons: [
          note(
            'Cascaded PID loops',
            'An outer angle loop commands an inner rate loop. Tune the inner loop first, because everything else depends on it.',
            30,
          ),
          code(
            'A PID controller',
            'error = target - measured\nintegral += error * dt\nderivative = (error - prev) / dt\noutput = kp * error + ki * integral + kd * derivative\nprev = error',
            25,
          ),
          note(
            'Tuning safely',
            'Tune in small steps with the vehicle restrained or in a safe open area. Watch for oscillation and shut down immediately if it grows.',
            25,
          ),
          note(
            'Failsafes and regulations',
            'Configure return-to-home, low-battery and signal-loss failsafes. Learn the local drone regulations before flying outdoors.',
            20,
          ),
        ],
      },
    ],
  },
  {
    name: 'Natural Language Processing with Transformers',
    category: 'Artificial Intelligence',
    shortDescription:
      'Understand and build language models with transformer networks.',
    fullDescription:
      'An advanced course on modern language technology. You will learn how text becomes numbers, how attention works, and how to fine-tune and evaluate transformer models for real tasks.',
    duration: 3,
    durationType: 'Months',
    targetLevel: 'Advanced',
    maxCohortSize: 20,
    tuitionFee: 50000,
    heroImageName: unsplash('photo-1620712943543-bcc4688e7485'),
    modules: [
      {
        title: 'Module 1: Text as Data',
        description: 'Tokens, embeddings, and classic baselines.',
        lessons: [
          note(
            'Tokenisation',
            'Models read tokens, not words. Subword tokenisers split rare words into pieces so the vocabulary stays small without losing coverage.',
            20,
          ),
          code(
            'Tokenising with a pretrained tokenizer',
            'from transformers import AutoTokenizer\n\ntok = AutoTokenizer.from_pretrained("bert-base-uncased")\nprint(tok("Learning is fun")["input_ids"])',
            15,
          ),
          note(
            'Embeddings',
            'An embedding maps each token to a vector so that similar meanings sit close together. Contextual embeddings change with the surrounding words.',
            25,
          ),
          note(
            'A bag-of-words baseline',
            'Always build a simple TF-IDF and logistic regression baseline first. It sets the bar a transformer must beat to justify its cost.',
            20,
          ),
        ],
      },
      {
        title: 'Module 2: The Transformer',
        description: 'Attention and the architecture.',
        lessons: [
          note(
            'Self-attention',
            'Each token computes weights over every other token and takes a weighted sum of their values. This lets the model relate distant words directly.',
            30,
          ),
          code(
            'Scaled dot-product attention',
            'def attention(q, k, v):\n    scores = q @ k.transpose(-2, -1) / math.sqrt(q.size(-1))\n    return torch.softmax(scores, dim=-1) @ v',
            30,
          ),
          note(
            'Encoder, decoder and encoder-decoder models',
            'Encoders suit understanding tasks, decoders suit generation, and encoder-decoders suit translation and summarisation.',
            25,
          ),
          note(
            'Positional information',
            'Attention has no built-in sense of order, so position is injected through positional encodings added to the embeddings.',
            20,
          ),
        ],
      },
      {
        title: 'Module 3: Fine-tuning and Evaluation',
        description: 'Adapting models to real tasks.',
        lessons: [
          code(
            'Fine-tuning a classifier',
            'from transformers import AutoModelForSequenceClassification, Trainer\n\nmodel = AutoModelForSequenceClassification.from_pretrained("bert-base-uncased", num_labels=3)\ntrainer = Trainer(model=model, args=args, train_dataset=train, eval_dataset=val)\ntrainer.train()',
            35,
          ),
          note(
            'Parameter-efficient fine-tuning',
            'Methods such as LoRA train a small number of extra weights instead of the whole model, cutting memory and cost dramatically.',
            25,
          ),
          note(
            'Evaluating language models',
            'Use task metrics such as F1 for classification, and add human review for generation. Check for bias and failure cases, not only averages.',
            30,
          ),
          note(
            'Capstone: build a text classifier',
            'Fine-tune a model on a labelled text dataset, compare it with your TF-IDF baseline, and document errors and limitations.',
            60,
          ),
        ],
      },
    ],
  },
];

export const EXTRA_LIVE_SESSIONS: SeedLiveSession[] = [
  {
    courseName: 'Embedded Systems & Microcontrollers',
    title: 'Workshop: interrupts and debouncing',
    type: 'Workshop',
    daysFromNow: 3,
    hourUtc: 17,
    durationMins: 90,
  },
  {
    courseName: 'Deep Learning with PyTorch',
    title: 'Live lecture: training a CNN from scratch',
    type: 'Lecture',
    daysFromNow: 5,
    hourUtc: 18,
    durationMins: 75,
  },
  {
    courseName: 'Cybersecurity Essentials',
    title: 'Q&A: securing your first web app',
    type: 'QandA',
    daysFromNow: 7,
    hourUtc: 16,
    durationMins: 45,
  },
  {
    courseName: 'Python for Data Analysis',
    title: 'Workshop: cleaning a messy dataset',
    type: 'Workshop',
    daysFromNow: 9,
    hourUtc: 17,
    durationMins: 90,
  },
  {
    courseName: 'Drone Design and Flight Control',
    title: 'Live lecture: PID tuning for multirotors',
    type: 'Lecture',
    daysFromNow: 10,
    hourUtc: 18,
    durationMins: 60,
  },
  {
    courseName: 'Natural Language Processing with Transformers',
    title: 'Q&A: fine-tuning on a budget',
    type: 'QandA',
    daysFromNow: 12,
    hourUtc: 17,
    durationMins: 45,
  },
];
