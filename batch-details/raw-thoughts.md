# Batch Wise

- We are an ed-tech called Masai based in Bengaluru, India.
- We run different programs in collaboration with different institutes. Each program has multiple batches.
- So let's take a batch a proper unit. Each of this batch will have different properties like
  - batch name of that batch ( each batch has a unique name like `IITP-AIMLTN-2602` which needs to be stored )
  - program name of that batch ( a batch belongs to a program, so we need to store the program name as well. This name will be like `Certification in Artificial Intelligence and Machine Learning` etc )
  - institute name of that batch ( a batch belongs to an institute, so we need to store the institute name as well. This name will be like `i-HUB IIT Patna` etc )
  - model number of that batch ( we have different models like 0,1,2,3 )
  - start date of that batch ( we need to store the start date of that batch as well )
  - end date of that batch as per duration( we need to store the end date of that batch as per duration as well )
  - actual end date of that batch ( we need to store the end date of that batch as well. Basically we create schedule at the start of the batch and we have a duration for that batch. So we can calculate the end date as per duration. But sometimes due to some reasons, the batch may end later than the end date as per duration. So we need to store the actual end date of that batch as well )
  - status of that batch ( we need to store the status of that batch as well. The status can be `about-to-start`, `in-order`, `completed/last-leg` etc )
  - I also want to store different members related to that batch like
    - Curriculum coordinator
    - Instructor 1 ( IIT / IIM Professor )
    - Instructor 2 ( Industry Mentor )
    - Instructor 3 ( Industry Mentor )
    - Teaching Assistant 1
    - Teaching Assistant 2
    - Teaching Assistant 3
    - Teaching Assistant 4
    - Teaching Assistant 5
    - Teaching Assistant 6
    - Teaching Assistant 7
    - Teaching Assistant 8
    - Teaching Assistant n ( we can have n number of teaching assistants, so we need to store the number of teaching assistants as well )
  - I'd like to also store the domain this particular batch belongs to. These are the domains I'd like to store
    - AI-ML-DS
    - Analytics
    - Cloud & DevOps
    - Cyber Security
    - Digital Marketing
    - Entrepreneurship / Leadership
    - Finance
    - Gen AI / Applied AI
    - Maths
    - Product Management
    - Project Management
    - Software Engineering
    - MBA
    - Others
  - I'd like to also store language of instruction for that batch as well. The language can be `English`, `Hindi`, `Telugu`, `Tamil`, `Kannada`, `Marathi`, `Malayalam` etc
  - The entire schedule of that batch. Each batch will have sessions. There should be a clear property like `end-of-schedule` meaning this indicates that the calendar isn't incomplete just that the schedule is complete and batch ends. Say 25th April 2026 is marked as end-of-schedule, it means that the schedule is complete and batch ends on 25th April 2026. But if 25th April 2026 is not marked as end-of-schedule, it means that the schedule is incomplete and we need to add more sessions in the schedule of that batch. So we need to store the entire schedule of that batch as well. This should be reflected in the calendar UI as well.
    - For each of the sessions of that batch, we need to store the properties of that session as well.The schedule will have different properties like
      - date of that session
      - day of that session ( Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday )
      - start_time of that session
      - end_time of that session
      - session-title of that session
      - learning-objectives of that session
      - to-be-taken-by { one-of professor, industry-mentor, teaching-assistant, program-coordinator, curriculum-coordinator, guest-lecturer }
      - instructor-name { name of professor, industry-mentor, teaching-assistant, program-coordinator, curriculum-coordinator, guest-lecturer }
      - rating of that session ( rating will be given by students after attending that session, so we need to store the rating of that session as well )
      - zoom link related to that session ( we need to store the zoom link related to that session as well )
- There will also be a grading policy associated with each batch. So we need to store the grading policy of that batch as well. The grading policy will have different properties like the below markdown table.

  ```
  |     Grading Component Name     | Weightage in % |
  |:------------------------------:|:--------------:|
  | Module 1 Mid Module Evaluation | 10             |
  | Module 1 End Module Evaluation | 10             |
  | Module 2 Mid Module Evaluation | 10             |
  | Module 2 End Module Evaluation | 10             |
  | Module 3 Mid Module Evaluation | 10             |
  | Module 3 End Module Evaluation | 10             |
  | End of Program - Offline Exam  | 30             |
  | Capstone Project               | 10             |
  ```

- One more property related to that batch is the link of the website or landing page of that program. So we need to store the link of the website or landing page of that program as well.

- I need to build a web application ( not responsive, only desktop version ) wherein I should be able to store all the information related to the batch in some sort of database and I should be able to see the calendar of that batch with all the sessions of that batch as well. I should also be able to edit the information related to the batch and session as well. Anytime user wants to edit anything related to the batch or session, it should be possible and the information should be shown in UI as table like it should be as smooth as editing a cell in google sheet. it should be in tabular format.

- The batches can be multiple and so main page will have batch names listed and when user clicks on any batch name, it should take the user to batch details and to the calendar of that batch with all the sessions of that batch as well.

- Each of the properties should be optional and there shouldn't be any compulsion to fill any of the properties. User can fill any of the properties as per their requirement and they can also leave any of the properties blank as well. So we need to make sure that all the properties are optional and there is no compulsion to fill any of the properties.
