import React, { useState, useEffect } from 'react';
import detectEthereumProvider from '@metamask/detect-provider';
import BatchStakingABI from './BatchStaking.json';
import { Button, Form, Container, Row, Col, Toast, ToastContainer, Badge, Spinner } from 'react-bootstrap';
import Footer from './Footer';

const { ethers } = require('ethers');

const contractAddress = process.env.REACT_APP_BATCH_DEPOSIT_CONTRACT_ADDRESS;
const urlAddress = process.env.REACT_APP_URL_BACKEND;

const BatchStaking = () => {
    const [signer, setSigner] = useState(null);
    const [contract, setContract] = useState(null);
    const [connectedAddress, setConnectedAddress] = useState(null);
    const [isWaitingForConfirmation, setIsWaitingForConfirmation] = useState(false);
    const [isRequestingAccount, setIsRequestingAccount] = useState(false);

    const [formData, setFormData] = useState({
      pubkeys: '',
      withdrawal_credentials: '',
      signatures: '',
      deposit_data_roots: '',
      execution_address: '',
      num_validators: '2',  // Default as string
      chain: ''
    });

    const [numDeposits, setNumDeposits] = useState(null);
    const [totalETH, setTotalETH] = useState(null);
    const [walletBalance, setWalletBalance] = useState(null);

    const [showToast, setShowToast] = useState(false);
    const [toastBody, setToastBody] = useState('');
    const [toastVariant, setToastVariant] = useState('warning');

    useEffect(() => {
      if (window.ethereum) {
        getCurrentAccount();
        window.ethereum.on('accountsChanged', (accounts) => {
          console.log("changed!!")
          if (accounts.length > 0) {
            setConnectedAddress(accounts[0]);
          } else {
            setConnectedAddress(null);
          }
        });
      } else {
        console.log("MetaMask is not available!");
      }
    
      // Clean up the event listener when the component is unmounted
      return () => {
        if (window.ethereum) {
          console.log("removeListerner")
          window.ethereum.removeListener('accountsChanged', getCurrentAccount);
        }
      };
    }, []);


    const handleToast = (message, variant) => {
        setToastBody(message);
        setToastVariant(variant);
        setShowToast(true);
    };

    const handleInputChange = (event) => {
      const { name, value } = event.target;
      setFormData({ ...formData, [name]: value });
    };

    const isValidAddress = (address) => {
      try {
        return ethers.isAddress(address)
      } catch (e) {
        console.log(e)
        return false;
      }
    };
    // Function to get the current account
    const getCurrentAccount = async () => {
        if (!window.ethereum._metamask.isUnlocked()) return
        if (isRequestingAccount) return;

        setIsRequestingAccount(true);
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length === 0) {
                console.log('Please connect to MetaMask.');
            } else {
                setConnectedAddress(accounts[0]);
                const ethersProvider = new ethers.BrowserProvider(window.ethereum)
                const signer = await ethersProvider.getSigner();
                const address = await signer.getAddress();
                setConnectedAddress(address);
                setSigner(signer);
                const batchStakingContract = await new ethers.Contract(contractAddress, BatchStakingABI.abi, signer);
                setContract(batchStakingContract);
                const walletBl = (await ethersProvider.getBalance(address)).toString();
                console.log(address);
                console.log(walletBl);
                console.log(ethers.formatUnits(walletBl, 'ether'));
                setWalletBalance(ethers.formatUnits(walletBl, 'ether', 5))
                fetch(`http://${urlAddress}/check_wallet`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ wallet_address: accounts[0] }),
                })
                .then(response => response.json())
                .then(data => console.log('Success:', data))
                .catch((error) => console.error('Error:', error));
            }
        } catch (error) {
            console.error("Error requesting account:", error);
            handleToast("Error requesting account", "warning");
        } finally {
            setIsRequestingAccount(false); // Reset the flag after the request is finished
        }
    };

    const connectWallet = async () => {
        try {
            const provider = await detectEthereumProvider();
            if (provider) {
                const ethersProvider = new ethers.BrowserProvider(window.ethereum)
                const signer = await ethersProvider.getSigner();
                const address = await signer.getAddress();
                setConnectedAddress(address);
                setSigner(signer);
                const batchStakingContract = await new ethers.Contract(contractAddress, BatchStakingABI.abi, signer);
                setContract(batchStakingContract);
                const walletBl = await ethersProvider.getBalance(address);
                setWalletBalance(walletBl);
            } else {
                console.error('Please install MetaMask!');
            }
        }
        catch (error) {
            console.log(error);
        }
    };

    const disconnectWallet = () => {
        // Logic to disconnect the wallet goes here
        // This might be setting the connected address state to null, for example:
        setConnectedAddress(null);
        // Depending on your wallet management library, you may need additional steps
    };

    const shortenAddress = (address) => `${address.slice(0, 6)}...${address.slice(-4)}`;

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file && file.type === "application/json") {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    const pubkeys = data.map(item => item.pubkey).join(',');
                    const withdrawal_credentials = data.map(item => item.withdrawal_credentials).join(',');
                    const signatures = data.map(item => item.signature).join(',');
                    const deposit_data_roots = data.map(item => item.deposit_data_root).join(',');

                    setFormData({
                        pubkeys,
                        withdrawal_credentials,
                        signatures,
                        deposit_data_roots
                    });
                    setNumDeposits(data.length);
                    setTotalETH(data.length * 32);
                } catch (error) {
                    console.error("Error parsing JSON:", error);
                    handleToast("Error parsing JSON file.", "warning");
                }
            };
            reader.readAsText(file);
        } else {
            setFormData({
                pubkeys: '',
                withdrawal_credentials: '',
                signatures: '',
                deposit_data_roots: ''
            });
            setNumDeposits(0);
            handleToast("Upload a valid JSON", "warning");
        }
    };

    const handleGenerateKeys = async (event) => {
        event.preventDefault();
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        const { execution_address, num_validators } = formData;
        const chain = 'holesky'
        console.log(execution_address)
        if (!isValidAddress(execution_address)) {
          handleToast('Invalid execution address format', 'danger');
          return;
        }

        try {
          const response = await fetch(`http://${urlAddress}/generate_keys`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              execution_address,
              wallet_address: accounts[0],
              num_validators: parseInt(num_validators, 10),
              chain,
            }),
          });
    
          if (response.ok) {
            const data = await response.json();
            console.log('Success:', data);
      
            // Update formData with the returned data
            setFormData({
              pubkeys: data.map(item => item.pubkey).join(','),
              withdrawal_credentials: data.map(item => item.withdrawal_credentials).join(','),
              signatures: data.map(item => item.signature).join(','),
              deposit_data_roots: data.map(item => item.deposit_data_root).join(','),
              execution_address,
              num_validators: num_validators.toString(),
              chain
            });
      
            handleToast('Keys generated successfully', 'success');
          } else {
            const errorData = await response.json();
            handleToast(`Error: ${errorData.error}`, 'danger');
            console.error('Error:', errorData);
          }
        } catch (error) {
          handleToast(`Error: ${error.message}`, 'danger');
          console.error('Error:', error);
        }
    };


    const handleSubmit = async (event) => {
        event.preventDefault();
        // Check if the contract is initialized and formData contains data
        if (contract && formData.pubkeys) {
            // Split the concatenated string values back into arrays
            let pubkeys = formData.pubkeys.split(',');
            let withdrawal_credentials = formData.withdrawal_credentials.split(',');
            let signatures = formData.signatures.split(',');
            let deposit_data_roots = formData.deposit_data_roots.split(',');

            // Prepend '0x' to each element in the arrays
            pubkeys = pubkeys.map(key => `0x${key}`);
            withdrawal_credentials = withdrawal_credentials.map(cred => `0x${cred}`);
            signatures = signatures.map(sig => `0x${sig}`);
            deposit_data_roots = deposit_data_roots.map(root => `0x${root}`);

            // Calculate the total deposit amount based on the number of entries
            const numDeposits = ethers.toBigInt(pubkeys.length);
            const depositAmount = ethers.parseUnits('32', 'ether') * numDeposits;

            try {
                // Execute the batch staking operation with the data from formData
                const tx = await contract.batchStaking(pubkeys, withdrawal_credentials, signatures, deposit_data_roots, { value: depositAmount });
                console.log(tx);
                setToastBody(<>Transaction sent! <a href={`https://etherscan.io/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer">View on Etherscan</a></>);
                setToastVariant('success');
                setShowToast(true);
                setIsWaitingForConfirmation(true);
                resetFormFields();
                const receipt = await tx.wait();
                console.log(receipt);
                // Hide spinner once transaction is confirmed
                setIsWaitingForConfirmation(false);

                // Show transaction confirmed toast
                setToastBody(`Transaction confirmed! Block number: ${receipt.blockNumber}`);
                setToastVariant('success');
                setShowToast(true);
            } catch (error) {
                // Hide spinner if there was an error
                setIsWaitingForConfirmation(false);

                // Handle the error with a toast
                let errorStr = 'Error staking: ' + error.info
                handleToast(errorStr, 'danger');
                console.error('Error staking:', error);
            }
        } else {
            handleToast("Please upload deposit data file.", 'warning');
        }
    };

    const resetFormFields = () => {
        setFormData({
            pubkeys: '',
            withdrawal_credentials: '',
            signatures: '',
            deposit_data_roots: ''
        });
        // Reset any other state that tracks input values as needed
    };
    return (
        <div>
            <Container className="mt-5">
                {isWaitingForConfirmation && (
                    <div className="spinner-container">
                        <Spinner animation="border" role="status">
                            <span className="visually-hidden">Waiting for confirmation...</span>
                        </Spinner>
                    </div>
                )}
                <ToastContainer className="p-3" position="top-end">
                    <Toast onClose={() => setShowToast(false)} show={showToast} delay={15000} autohide>
                        <Toast.Header>
                            <strong className="me-auto">Informative</strong>
                            <small>Just now</small>
                        </Toast.Header>
                        <Toast.Body className={`bg-${toastVariant} text-dark`}>{toastBody}</Toast.Body>
                    </Toast>
                </ToastContainer>
                <div className="d-grid">
                    {connectedAddress ? (
                        <div className="wallet-connected d-flex align-items-center">
                            <Button variant="secondary" size="sm" className="btn-disconnect-wallet me-2" onClick={disconnectWallet}>
                                <i class="fa-solid fa-power-off"></i>
                            </Button>
                            <h5 className="mb-0 me-2"><Badge bg="success">{shortenAddress(connectedAddress)}</Badge></h5>
                        </div>
                    ) : (
                        <Button variant="primary" className="btn-connect-wallet" onClick={connectWallet}>
                            Connect Wallet
                        </Button>
                    )}
                </div>

            <Row className="justify-content-md-center">
                <Col xs={12} md={8}>
                    <h3 className="text-center mb-4">Batch Deposit</h3>
                    <div className="file-upload-instructions">
                      <h4>Step-by-Step Guide to Making a Batch Deposit</h4>
                      <p>First, generate your <code>deposit_data-xxxxx.json</code> file. Follow the detailed instructions available on the <a href="https://ethereum.org/en/developers/docs/" target="_blank">Ethereum Launchpad</a>.</p>
                      <p>After generating the file, you are ready to proceed with the batch deposit.</p>
                      <p><strong>Important:</strong> Before you initiate the transaction, double-check that the destination address matches exactly:
                          <strong> {process.env.REACT_APP_BATCH_DEPOSIT_CONTRACT_ADDRESS} </strong>.</p>
                      <p>This step is crucial as sending funds to an incorrect address could result in the irreversible loss of those funds. Ensure the address in your transaction matches the one shown above.</p>
                      <p>If you have any questions or encounter any issues, please refer to our <a href="https://ethereum.org/en/help/" target="_blank">help section</a> or contact support.</p>
                    </div>
                    <div>
                      <Form onSubmit={handleGenerateKeys}>
                        <Form.Group className="mb-3">
                          <Form.Label>Execution Address</Form.Label>
                          <Form.Control
                            type="text"
                            placeholder="Enter Execution Address"
                            name="execution_address"
                            value={formData.execution_address}
                            onChange={handleInputChange}
                          />
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>Number of Validators</Form.Label>
                          <Form.Control
                            type="number"
                            placeholder="Enter Number of Validators"
                            name="num_validators"
                            value={formData.num_validators}
                            onChange={handleInputChange}
                          />
                        </Form.Group>
                        <Button variant="primary" type="submit">
                          Generate Keys
                        </Button>
                      </Form>
                    </div>
                    <Form onSubmit={handleSubmit}>
                        <Form.Group controlId="formFile" className="mb-3">
                            <Form.Label></Form.Label>
                            <Form.Control type="file" accept=".json" onChange={handleFileChange} />
                        </Form.Group>
                        {formData.pubkeys && (
                            <div className="data-badges-container">
                                <h6 className="deposits-label">
                                Number Of Deposits: <span className="deposits-number-badge">{numDeposits}</span>
                                Total ETH To Deposit: <span className="deposits-number-badge">{totalETH}</span><p></p>
                                Total Wallet Balance: <span className="deposits-number-badge">{walletBalance} ETH</span>
                                </h6>
                                <Form.Group className="mb-3">
                                <Form.Label>Validators Public Keys</Form.Label>
                                <div className="data-badges">
                                    {formData.pubkeys.split(',').map((pubkey, index) => (
                                    <span key={index} className="badge me-2 mb-2">
                                        {pubkey}
                                    </span>
                                    ))}
                                </div>
                                </Form.Group>

                                    <Form.Group className="mb-3">
                                        <Form.Label>Withdrawal Credentials</Form.Label>
                                        <div className="data-badges">
                                            {formData.withdrawal_credentials.split(',').map((credential, index) => (
                                                <span key={index} className="badge me-2 mb-2">
                                                    {credential}
                                                </span>
                                            ))}
                                        </div>
                                    </Form.Group>

                                    <Form.Group className="mb-3">
                                        <Form.Label>Signatures</Form.Label>
                                        <div className="data-badges">
                                            {formData.signatures.split(',').map((signature, index) => (
                                                <span key={index} className="badge me-2 mb-2">
                                                    {signature}
                                                </span>
                                            ))}
                                        </div>
                                    </Form.Group>

                                    <Form.Group className="mb-3">
                                        <Form.Label>Deposit Data Roots</Form.Label>
                                        <div className="data-badges">
                                            {formData.deposit_data_roots.split(',').map((root, index) => (
                                                <span key={index} className="badge me-2 mb-2">
                                                    {root}
                                                </span>
                                            ))}
                                        </div>
                                    </Form.Group>
                                </div>
                            )}

                            <div className="d-grid">
                                <Button className="btn-stake" type="submit" disabled={!formData.pubkeys}>
                                    Stake
                                </Button>
                            </div>
                        </Form>
                    </Col>
                </Row>
            </Container>
            <footer className="footer">
                <Footer />
            </footer>
        </div>
    );
};

export default BatchStaking;
