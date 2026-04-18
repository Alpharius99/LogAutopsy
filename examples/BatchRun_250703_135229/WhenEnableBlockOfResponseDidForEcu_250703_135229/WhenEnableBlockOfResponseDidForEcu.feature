Feature: When enable block of response <Did> for <EcuName> ECU

    Scenario: Precondition
        When StartCarBusTrace
        And UnlockCentralLockingSystem
        And CarEntry
        And TurnOnClamp15
		
    Scenario: TestCase
        When enable block of response IVD-C for Clima ECU
        Then response to request IVD-C is not sent for Clima ECU
		
    Scenario: PostCondition
        When TurnOnClamp15
        And CarLeave
        And LockCentralLockingSystem
        And StopCarBusTrace