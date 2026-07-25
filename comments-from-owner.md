# MAYODE Application Owner's Comments and Requirements

This document presents the application owner's comments in clear English while preserving the original meaning and sequence.

## 1. AMCOS Naming and Coverage

MAMCOS stands for **Madibira Agricultural and Marketing Cooperative Society**. However, the appropriate name to use in the system is **Madibira AMCOS**.

Mbuyuni is also an AMCOS. Therefore, the system should include AMCOS names such as:

- Madibira AMCOS
- Mbuyuni AMCOS
- Ubaruku AMCOS

Additional research should be conducted to identify all AMCOS organizations operating in Mbarali District and other regions so that they can also be included in the system.

## 2. Profile, Verification, Support, Weather, Farm Details, and Analytics

### 2.1 User Profile and Identity Verification

The user's profile should display a verification indicator, such as a verified tick or star, next to the user's name.

The final stage of profile registration should be identity verification. The user should submit:

- A valid identification document, such as a NIDA ID or voter identification card.
- A recent photograph.
- A rotating or guided facial-capture verification process.

This process should confirm that the person submitting the information is the actual owner of the identity document.

### 2.2 Help and Support

The application should include a Frequently Asked Questions and Answers section. The required content can be prepared and added later.

This section should provide customers with readily available answers so that they do not need to contact support for every common question.

### 2.3 Weather Information

Please confirm whether the weather section currently displays demonstration data or actual weather information for the user's location.

The final system should display real weather information for the relevant farming area.

### 2.4 Farm Name and Location Structure

The farm name should not be optional.

In addition to GPS coordinates, the farm should have a structured name that clearly describes its location, moving from the most specific identifier to the broader administrative or cooperative area. For example:

`Plot No. 02, Block 5, South-West Section, Madibira AMCOS`

Where applicable, the naming structure may include:

- Plot number
- Block number
- Direction or section, such as North-East, North-West, South-East, or South-West
- Village
- Ward
- District
- Region
- Responsible AMCOS

The village and cooperative fields should remain available as separate fields where necessary.

### 2.5 Farm Coordinates, Soil Analytics, Images, and AI-Based Analysis

The farm-details section should include GPS coordinates.

The current optional soil-condition field is subjective because a user may enter inaccurate information to make the farm appear more productive. Instead of relying only on user-entered descriptions, the system should include soil analytics that can validate or challenge the information submitted by the farmer.

The farm-registration process should also allow the user or field officer to upload at least three to five farm photographs.

The platform should provide a comprehensive farm-analytics report generated from:

- Farm-registration information
- GPS and mapping data
- Soil information
- Satellite information
- Field observations
- Other available tools and AI services

The farm-analytics report should bring all relevant information together in one printable report, including:

- Farm name and location
- Farm size
- Soil analysis
- Farm condition
- Estimated or potential yield
- Estimated farm value
- Road accessibility
- Water accessibility
- Other relevant farm indicators

Registered MAYODE members should be able to unlock advanced farm analytics, guidance, and consultation services. Premium members may receive recommendations on how to manage their farms and achieve the projected yield.

Farm registration should remain simple, while advanced analytics and advisory services should be available through MAYODE membership.

### 2.6 Road Access and Distance Analysis

All farms should be mapped. The analytics section should show the distance between the farm and the nearest road.

Using the farm's coordinates, the system should calculate and display:

- Distance to the nearest road
- Available road access
- Other relevant accessibility information

These are the current comments. Additional comments may be shared later.

## 3. Visual Presentation and Farm-Registration Testing

The application should include attractive wallpapers, live wallpapers, background illustrations, or other visual elements related to agriculture or the specific section being viewed. These visuals should make the application more engaging when a user logs in.

The current progress looks very good, and the work is moving in the right direction.

Elisha should test the system by registering a farm and completing all currently available sections. This will allow the team to evaluate how the full process appears from the user's perspective.

## 4. Farm Ownership, Rental Status, and Support Email

During farm registration, the system should ask whether the person registering the farm is:

- The farm owner, or
- The renter or tenant currently using the farm

When the person is a renter, the system should collect the farm owner's information.

For example, if Elisha is registering a farm that he rents, the system should ask whether he is the owner or renter. If he selects renter, he should provide the name and relevant details of the person from whom he rented the farm.

The Help and Support email address should be:

`support@mayodegroup.com`

## 5. Free Farm Registration and Paid Analytics

Charging users before they register their farms may discourage adoption.

Farm registration should therefore be free. However, advanced farm analytics and other valuable information designed to improve farming practices and yields should be restricted to paid members.

The farmer should only need to pay when accessing advanced analytics, recommendations, guidance, and other premium services.

## 6. Notification and Membership Conversion System

The application should include a notification system that alerts users when immediate action is required on their farms.

When a notification relates to detailed farm guidance:

- Active members should be able to open and view the recommendation immediately.
- Non-members should be directed to register or pay for MAYODE membership before accessing the detailed information.

The notifications should create awareness and curiosity by informing farmers that their farms require attention, while still clearly communicating the value of membership.

## 7. Renter Verification and Seasonal Membership

A renter should be verified by the farm owner.

The system should clearly show that the renter has been verified by the owner. This will help MAYODE identify the person who is actively using each farm during a particular farming season and prevent farm information or notifications from being sent to the wrong person.

Membership should cover one complete farming season. For example, it may run:

- From July to July, or
- From August to August

The final membership cycle should be aligned with the actual farming calendar.

## 8. Verification Through MAYODE Officers and AMCOS Leaders

Many landowners do not own smartphones. Therefore, owner verification should not depend entirely on smartphone access.

When a renter registers a farm, the renter should provide accurate information about the farm owner.

A responsible MAYODE officer in the MAYOData department should have the contact details of AMCOS leaders and the leaders responsible for specific farming blocks.

For example, if a renter states that the farm was rented from Elisha, the MAYODE officer should:

1. Identify the plot number and block where the farm is located.
2. Contact the leader responsible for that block.
3. Confirm the legal owner of the specified farm.
4. Approve or reject the ownership and rental information.

The farm record would then be marked as verified by a MAYODE officer.

## 9. Farmer Awards and Incentive Programme

The system should include an awards or incentive programme for farmers who use the application.

For example, MAYODE may provide annual fertilizer support to selected application users. A farmer could receive an SMS such as:

> Congratulations. You have received fertilizer support for Farm Plot No. [number]. MAYODE will cover the cost of [number] bags of fertilizer.

This programme would encourage more farmers to register and actively use the application.

The system could randomly select five eligible farmers each year to receive free fertilizer support. The selection process should be transparent, auditable, and subject to defined eligibility rules.

## 10. Pre-Registration of Farms and USSD-Based Verification

Although verification by officers can work, involving many people may introduce bureaucracy and delays.

A more efficient approach would be to first consult irrigation-scheme leaders and AMCOS representatives to identify current farm owners. All farms should then be pre-registered in the system together with their confirmed owners.

At the beginning of a farming season, when someone registers as a renter or active user of a farm, the system should send a verification request to the owner through SMS or USSD. For example:

> This person is registering to use your farm. Do you recognize and approve this person? Reply Yes or No.

If the owner confirms the renter, the system should automatically mark the renter as verified by the owner.

Before farming activities begin, possibly around October or November depending on the actual season, the system should notify owners about the status of their farms. Examples include:

- A notice confirming the renter and the approved rental period.
- A request to confirm whether an unrented farm will be rented out.
- A confirmation that the owner will personally farm the land during the specified season.

The message may also invite the owner to join the MAYOData platform to receive:

- Farming techniques and guidance
- Farm analytics
- Fertilizer support
- Machinery support
- Seed support
- Other MAYODE services

This process would allow MAYODE to know who is actively using each hectare before the season begins.

Because many farmers do not have smartphones, USSD should be widely supported. Responses should be simple and limited to options such as:

- Yes
- No
- Continue
- Stop

## 11. Farm Selection and Renter Onboarding

When a renter starts registration, the system should automatically display the exact farm based on the standardized naming structure. It should also display the registered owner's name.

After the renter confirms that the displayed farm is correct, the renter may continue entering the remaining personal and seasonal information.

Another option is to allow farm owners to initiate the rental process. In this approach:

1. The owner enters the renter's name and contact information.
2. MAYODE sends an SMS or USSD notification to the renter.
3. The renter confirms that they are renting the farm.
4. The renter completes personal, account, and payment information.

The renter should not need to register the farm again because the farm information will already exist in the system. The renter should only confirm the farm, complete identity verification, and provide any required personal or banking information.

## 12. Role of the Cooperative or AMCOS Feature

The proposed cooperative feature is now clearer. The responsible AMCOS will enter and maintain information about its farmers and the farms under its area of responsibility.

This AMCOS-provided information will form the foundation for verifying farm ownership and assigning active users to farms.

## 13. Required User Interfaces and Complete Farm-Verification Workflow

The system should provide separate interfaces for the following user groups:

1. Farm owners
2. Farm renters or tenants
3. Responsible AMCOS officers
4. MAYODE management

### 13.1 Initial Farm and Ownership Data Collection

The process should begin with information collected from the responsible AMCOS. Each AMCOS should identify:

- Every registered hectare or farm
- The current legal owner of each farm
- Plot and block information
- Owner contact information
- Other available farm-identification details

This information should be entered into the system as pre-filled reference data.

When farmers later register, the system should recommend or display the information already provided by the responsible AMCOS. This is important because the AMCOS is expected to have the most accurate information about the legal owner of each hectare.

### 13.2 Owner Notification and Verification

After an AMCOS registers a farm and its owner, the owner should receive a notification informing them that the farm has been recorded under the responsible AMCOS.

The owner should confirm whether the farm belongs to them.

After confirming ownership, the owner should complete their personal details and gain access to an **Add Lease** feature.

### 13.3 Lease Registration

When the owner rents the farm to another person, the owner should use the Add Lease feature to provide:

- Renter's name
- Renter's contact information
- Lease start date
- Lease end date
- Farming season
- Any other required lease details

This feature must be available through both:

- The mobile application
- USSD for users without smartphones

### 13.4 Renter Notification and Activation

After the owner submits the lease information, MAYODE should automatically notify the renter that the owner has identified them as the authorized renter.

The renter should then complete their personal information and verification process.

After successful confirmation, the renter should be shown as the active user of that hectare for the specified farming season.

When a farm is not rented, the owner should be shown as the active user for that farming season.

### 13.5 Seasonal Confirmation

As the farming season approaches, owners should receive notifications asking them to confirm the active user of each farm.

The system should clearly show:

- Farms currently rented to other people
- The verified renter for each farm
- Farms still controlled and cultivated by the owner
- Lease periods and farming seasons

### 13.6 USSD and Feature-Phone Accessibility

The complete process should be available through both the application and USSD.

Simple actions should use Yes or No responses wherever possible. More detailed data entry should follow a step-by-step USSD process similar to mobile-money services such as M-Pesa.

The design should be accessible and easy to use for:

- Smartphone users
- Basic feature-phone users
- Farmers with limited digital experience

### 13.7 Field Data Collection by MAYODE

After the responsible AMCOS enters the initial ownership information, MAYODE field teams should visit the farms and collect additional information, including:

- GPS coordinates and farm boundaries
- Soil-use and soil-condition information
- Farm photographs
- Distance to roads
- Road accessibility
- Water access
- Irrigation information
- Other relevant physical farm characteristics

This information should be updated regularly.

Satellite data should also be used where possible to collect or validate additional farm information.

### 13.8 Reducing the Farmer's Data-Entry Burden

The system should reduce the amount of information that farmers must enter manually.

Most farm information should already be available from AMCOS records, MAYODE field teams, maps, satellite data, and previous records. The farmer's main responsibilities should be to:

- Register or confirm their identity
- Verify the correct farm
- Confirm ownership or rental status
- Subscribe to the required membership
- Provide only missing or updated details
- Continue with farming activities

Farmers should be given an option to add or correct information when they notice missing or inaccurate details.

This approach will make the system less tiring and easier to use. Users are more likely to read and verify pre-filled information than to complete long and complicated forms.

## 14. Demo Revision

The previously shared demo will need to be revised to reflect these updated requirements.

We apologize for any additional work or changes this may create, but the revision is necessary to ensure that the application follows the intended workflow.

## 15. Farmland Rental Marketplace

In a future version, the application should include a section that lists farms or hectares currently available for rent.

Users should be able to:

- Browse available farmland
- View farm details
- See the location and responsible AMCOS
- Review the rental period and conditions
- Submit a booking or rental request
- Track the status of the request

This feature would create a farmland rental marketplace within the MAYODE platform.
