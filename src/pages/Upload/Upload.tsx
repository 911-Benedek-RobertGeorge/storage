import React, { useEffect, useState } from "react";
import { MusicDataNftForm } from "../../components/InputComponents/MusicDataNftForm";
import { useLocation } from "react-router-dom";
import { Button } from "../../libComponents/Button";
import axios from "axios";
import { useGetLoginInfo } from "@multiversx/sdk-dapp/hooks";
import { API_URL } from "../../utils/constants";
import { ToolTip } from "../../libComponents/Tooltip";
import { CopyIcon, InfoIcon } from "lucide-react";
import ProgressBar from "../../components/ProgressBar";
import toast, { Toaster } from "react-hot-toast";

 
//todo verify and dont allow users to upload manifest files without songs
// todo when reloading after uploading a manifest file, make it to show the new manifest file not the old one
// todo error handling , watch a video before

type SongData = {
  date: string;
  category: string;
  artist: string;
  album: string;
  title: string;
  file: string;
  cover_art_url: string;
};

type FilePair = {
  image: File;
  audio: File;
};

export const UploadData: React.FC = (props) => {
  const location = useLocation();

  const { manifestFile, action, type, template, storage, descentralized, version } = location.state || {};
  const [songsData, setSongsData] = useState<Record<number, SongData>>({});
  const [filePairs, setFilePairs] = useState<Record<number, FilePair>>({});

  const [numberOfSongs, setNumberOfSongs] = useState(1);
  const { tokenLogin } = useGetLoginInfo();
  const theToken = tokenLogin?.nativeAuthToken;

  const [isUploadingSongs, setIsUploadingSongs] = useState(false);
  const [isUploadingManifest, setIsUploadingManifest] = useState(false);

  const [progressBar, setProgressBar] = useState(0);
  const [manifestCid, setManifestCid] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    creator: "",
    createdOn: "",
    modifiedOn: "",
    totalItems: 0,
    stream: "false",
  });
  const apiUrlPost = `${API_URL}/upload`;

  useEffect(() => {
    if (manifestFile && manifestFile.data_stream) {
      try {
        const dataStream = manifestFile.data_stream;
        setFormData({
          ["name"]: dataStream.name,
          ["creator"]: dataStream.creator,
          ["createdOn"]: dataStream.created_on,
          ["modifiedOn"]: new Date(dataStream.last_modified_on).toISOString().split("T")[0],
          ["stream"]: dataStream.marshalManifest.nestedStream === true ? "true" : "false",
          ["totalItems"]: dataStream.marshalManifest.totalItems,
        });
        setNumberOfSongs(dataStream.marshalManifest.totalItems + 1);
        const songsDataMap = manifestFile.data.reduce(
          (acc: any, song: any) => {
            if (song) acc[song.idx] = song;
            return acc;
          },
          {} as Record<number, SongData>
        );
        setSongsData(songsDataMap);
      } catch (err) {
        console.log("ERROR: ", err);
        if (err instanceof Error) {
          toast.error("Error parsing manifest file. Invalid manifest file : " + err.message);
        } else {
          toast.error("Error parsing manifest file.");
        }
      }
    }
  }, [manifestFile]);

  // upload the songs and images of all the songs
  async function uploadSongsAndImagesFiles() {
    /// refactor , iterate through the files, not through the songsData
    const filesToUpload = new FormData();
    try {
      //iterating over the songsData and for each object add its image and song to the formData
      Object.values(songsData).forEach((songData, idx) => {
        // todo must change the way of storing, its not ok only by title
        if (songData && songData?.title && filePairs[idx + 1]) {
          if (filePairs[idx + 1]?.image) {
            filesToUpload.append("files", filePairs[idx + 1].image, (version ? version + 1 : "1") + ".-image." + songData.title); ///   + "-" + filePairs[idx+1].image.name);
          }
          if (filePairs[idx + 1]?.audio) filesToUpload.append("files", filePairs[idx + 1].audio, (version ? version + 1 : "1") + ".-audio." + songData.title); //+ "-" + filePairs[idx+1].audio.name);
        }
      });
      //console.log("form data : ", filesToUpload.getAll("files").length);
    } catch (err) {
      console.log("ERROR iterating through songs Data : ", err);
      toast.error(
        "Error iterating through songs Data : " + `${err instanceof Error ? err.message : ""}` + " Please check all the fields to be filled correctly."
      );
    }
    if (filesToUpload.getAll("files").length === 0) return [];
    try {
      const response = await axios.post(apiUrlPost, filesToUpload, {
        headers: {
          "authorization": `Bearer ${theToken}`,
          "Content-Type": "multipart/form-data",
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error uploading files:", error);
      toast.error("Error uploading files to Ipfs: " + `${error instanceof Error ? error.message : ""}`);
    }
  }

  /**
   * Get all songs data into the right format for manifest file
   * Transforms the songs data and uploads the songs and images files.
   * @returns {Array<Object>} The transformed data of the songs.
   * @throws {Error} If the upload songs process did not work correctly or if the data has not been uploaded correctly.
   */
  async function transformSongsData() {
    setIsUploadingSongs(true);
    setProgressBar(20);
    try {
      const responseDataCIDs = await uploadSongsAndImagesFiles();
      //console.log("THE RESPONSE data IS : ", responseDataCIDs);

      if (!responseDataCIDs) throw new Error("Upload songs returned empty array");
      // Iterate through the response list and find the matching cidv1
      const transformedData = Object.values(songsData).map((songObj, index) => {
        if (songObj && songObj?.title) {
          let matchingObjImage;
          let matchingObjSong;
          const fileObj = filePairs[index + 1];
          if (fileObj) {
            if (fileObj.image && fileObj.image.name) {
              matchingObjImage = responseDataCIDs.find(
                (uploadedFileObj: any) => uploadedFileObj.fileName === (version ? version + 1 : "1") + `.-image.${songObj.title}`
              );
              if (!matchingObjImage) throw new Error("The data has not been uploaded correctly. Image CID could not be found ");
            }
            if (fileObj.audio && fileObj.audio.name) {
              matchingObjSong = responseDataCIDs.find(
                (uploadedFileObj: any) => uploadedFileObj.fileName === (version ? version + 1 : "1") + `.-audio.${songObj.title}`
              );
              if (!matchingObjSong) throw new Error("The data has not been uploaded correctly. Song CID could not be found ");
            }
          }

          // console.log("matching IMG: ", matchingObjImage);
          // console.log("SONG:", matchingObjSong);

          return {
            idx: index + 1,
            date: new Date(songObj?.date).toISOString(),
            category: songObj?.category,
            artist: songObj?.artist,
            album: songObj?.album,
            file: matchingObjSong ? `https://ipfs.io/ipfs/${matchingObjSong.cidv1}` : songObj.file,
            cover_art_url: matchingObjImage ? `https://ipfs.io/ipfs/${matchingObjImage.cidv1}` : songObj.cover_art_url,
            title: songObj?.title,
          };
        }
      });

      setIsUploadingSongs(false);
      // return only the songs that are not null
      return transformedData.filter((song: any) => song !== null);
    } catch (err) {
      toast.error("Error transforming the data: " + `${err instanceof Error ? err.message : ""}`);
      console.log("ERROR transforming the data: ", err);
      setIsUploadingSongs(false);
    }
  }
  /**
   * Generates a manifest file based on the form data and uploads it to the server.
   * If any required fields are missing, an error toast is displayed.
   * The manifest file is created with the following structure:
   * {
   *   "data_stream": {
   *     "name": string,
   *     "creator": string,
   *     "created_on": string,
   *     "last_modified_on": string,
   *     "marshalManifest": {
   *       "totalItems": number,
   *       "nestedStream": boolean
   *     }
   *   },
   *   "data": any
   * }
   * The manifest file is uploaded to the server using a multipart/form-data request.
   * The response contains the CID (Content Identifier) of the uploaded manifest file.
   * If the upload is successful, the CID is set as the manifestCid state.
   * @throws {Error} If there is an error transforming the data or if the manifest file is not uploaded correctly.
   */
  const generateManifestFile = async () => {
    if (!formData.name || !formData.creator || !formData.createdOn || !songsData) {
      toast.error("Please fill all the fields from the header section");
      return;
    }
    try {
      const data = await transformSongsData();
      if (data === undefined) {
        throw new Error("Error transforming the data. Add at least one song.");
      }
      setIsUploadingManifest(true);
      setProgressBar(60);
      const manifest = {
        "data_stream": {
          "name": formData.name,
          "creator": formData.creator,
          "created_on": formData.createdOn,
          "last_modified_on": version ? new Date().toISOString() : formData.createdOn,
          "marshalManifest": {
            "totalItems": numberOfSongs - 1,
            "nestedStream": formData.stream === "true" ? true : false,
          },
        },
        "data": data,
      };
      const formDataFormat = new FormData();
      formDataFormat.append(
        "files",
        new Blob([JSON.stringify(manifest)], { type: "application/json" }),
        (version ? version + 1 : "1") + ".-manifest-" + formData.name + "-" + formData.creator
      );

      const response = await axios.post(apiUrlPost, formDataFormat, {
        headers: {
          "authorization": `Bearer ${theToken}`,
          "Content-Type": "multipart/form-data",
          // "x-amz-meta-marshal-deep-fetch": 1,
        },
      });

      const ipfs: any = "ipfs/" + response.data[0].cidv1;
      if (response.data[0]) setManifestCid(ipfs);
      else {
        throw new Error("The manifest file has not been uploaded correctly");
      }
    } catch (error) {
      toast.error("Error generating the manifest file: " + `${error instanceof Error ? error.message : ""}`);
      setIsUploadingManifest(false);
      console.log("Error:", error);
    }
    setIsUploadingManifest(false);
    setProgressBar(100);
  };

  const handleAddMoreSongs = () => {
    setSongsData((prev) => Object.assign(prev, { [numberOfSongs]: {} }));
    setNumberOfSongs((prev) => prev + 1);
  };

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  function deleteSong(index: number) {
    const variableSongsData = { ...songsData };
    const variableFilePairs = { ...filePairs };
    for (let i = index; i < numberOfSongs - 1; ++i) {
      variableSongsData[i] = variableSongsData[i + 1];
      variableFilePairs[i] = variableFilePairs[i + 1];
    }
    delete variableSongsData[numberOfSongs - 1];
    delete variableFilePairs[numberOfSongs - 1];
    setSongsData(variableSongsData);
    setFilePairs(variableFilePairs);
    setNumberOfSongs((prev) => prev - 1);
  }

  /**
   * Swaps the songs at the given indices in the songsData and filePairs state.
   * If second is -1, it deletes the song at index first.
   * @param first - The index of the first song to swap or delete.
   * @param second - The index of the second song to swap. Use -1 to delete the song at index first.
   */
  function swapSongs(first: number, second: number) {
    if (first < 1 || second >= numberOfSongs) {
      return;
    }

    // deleting song with index first
    if (second === -1) {
      deleteSong(first);
      return;
    }

    const songsDataVar = { ...songsData };
    const storeSong = songsDataVar[second];
    songsDataVar[second] = songsDataVar[first];
    songsDataVar[first] = storeSong;

    const storeFilesVar = { ...filePairs };
    const storeFile = storeFilesVar[second];
    storeFilesVar[second] = storeFilesVar[first];
    storeFilesVar[first] = storeFile;

    setSongsData(songsDataVar);
    setFilePairs(storeFilesVar);
  }

  // setter function for a music Data nft form fields and files
  const handleFilesSelected = (index: number, formInputs: any, image: File, audio: File) => {
    if (image && audio) {
      // Both image and audio files uploaded
      setFilePairs((prevFilePairs) => ({
        ...prevFilePairs,
        [index]: { image: image, audio: audio },
      }));
    } else if (image) {
      // Only image file uploaded
      setFilePairs((prevFilePairs) => ({
        ...prevFilePairs,
        [index]: { ...prevFilePairs[index], image: image },
      }));
    } else if (audio) {
      // Only audio file uploaded
      setFilePairs((prevFilePairs) => ({
        ...prevFilePairs,
        [index]: { ...prevFilePairs[index], audio: audio },
      }));
    }
    setSongsData((prev) => Object.assign({}, prev, { [index]: formInputs }));
  };

  /// copy the link to clipboard
  function copyLink(text: string): void {
    if (text) navigator.clipboard.writeText(text);
    else toast.error("Error copying the link to clipboard");
  }
  // console.log("songsData: ", songsData);
  // console.log("filePairs: ", filePairs);
  // console.log("manifestFile: ", manifestFile);
  // console.log("formData: ", formData);
  // console.log("totalItems: ", numberOfSongs);
  // console.log("manifestCid: ", manifestCid);

  return (
    <div className="p-4 flex flex-col">
      <b className=" py-2 text-xl  font-medium"> Let’s update your data! Here is what you wanted to do... </b>
      <div className="flex flex-row gap-4 mb-4">
        {action && (
          <span className="w-32 border-2 text-bold border-blue-400 bg-blue-900 text-blue-400 text-center text-sm font-medium mr-2 px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
            {action}
          </span>
        )}
        {type && (
          <span className="w-32 border-2 text-bold border-blue-400 bg-blue-900 text-blue-400 text-center text-sm font-medium mr-2 px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
            {type}
          </span>
        )}
        {template && (
          <span className="w-32 border-2 text-bold border-blue-400 bg-blue-900 text-blue-400 text-center  text-sm font-medium mr-2 px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
            {template}
          </span>
        )}
        {storage && (
          <span className="w-32 border-2 text-bold border-blue-400 bg-blue-900 text-blue-400 text-center text-sm font-medium mr-2 px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
            {descentralized ? descentralized : storage}
          </span>
        )}
      </div>
      <div className="z-[-1] relative w-full ">
        <div className="absolute top-30 left-20 w-96 h-72 bg-sky-500/70 rounded-full  mix-blend-multiply filter blur-2xl opacity-50  animate-blob animation-delay-4000"></div>

        <div className="absolute top-0 -left-4 w-96 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-2xl opacity-50 animate-blob "></div>
        <div className="absolute top-0 -right-4 w-72 h-96 bg-[#300171] rounded-full  mix-blend-multiply filter blur-2xl opacity-50  animate-blob animation-delay-2000"></div>
        <div className="absolute top-30 -left-20 w-96 h-72 bg-sky-500/70 rounded-full  mix-blend-multiply filter blur-2xl opacity-50  animate-blob animation-delay-4000"></div>
        <div className="absolute top-20 -left-20 w-96 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-2xl opacity-50 animate-blob "></div>
      </div>
      <div className="min-h-screen flex flex-col items-center justify-start rounded-3xl bg-black/20">
        <div className="z-2 p-4 flex flex-col bg-gradient-to-b from-sky-500/20 via-[#300171]/20 to-black/20 rounded-3xl shadow-xl hover:shadow-sky-500/50 max-w mx-auto">
          <div className="flex flex-row gap-8 items-center">
            <h1 className="text-2xl font-bold mb-6">Header </h1>
            <div className="ml-auto flex flex-col">
              <h3> {version && `Version:  ${version}`}</h3>
              <label htmlFor="totalItems" className="block text-foreground ">
                Total Items: {numberOfSongs - 1}
              </label>
            </div>
          </div>
          <form className="flex gap-x-4">
            <div className="mb-4">
              <label htmlFor="name" className="block text-foreground mb-2">
                Name:
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-3 bg-black/20 py-2 border-2 border-gray-300 rounded focus:outline-none focus:border-blue-500"
                required={true}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="creator" className="block text-foreground mb-2">
                Creator:
              </label>
              <input
                type="text"
                id="creator"
                name="creator"
                value={formData.creator}
                onChange={handleChange}
                className="w-full bg-black/20 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                required={true}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="createdOn" className="block text-foreground mb-2">
                Created On:
              </label>
              <input
                type="date"
                id="createdOn"
                name="createdOn"
                value={formData.createdOn}
                onChange={handleChange}
                className="w-full px-3 bg-black/20 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500 "
                required={true}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="modifiedOn" className="block text-foreground mb-2">
                Modified On:
              </label>
              <input
                type="date"
                id="modifiedOn"
                name="modifiedOn"
                disabled={true}
                value={formData.modifiedOn}
                onChange={handleChange}
                className="w-full bg-black/20 px-3 py-2   rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* { template !== "Music Data Nft" && <div className="mb-4">
              <ToolTip tooltip="Music Data Nft shoud be streamed- select yes">
                <label htmlFor="stream" className="block text-foreground mb-2">
                  Stream:
                </label>
              </ToolTip> 
              <div className="flex items-center">
                <input type="radio" id="streamYes" name="stream" value="true" checked={formData.stream === "true"} onChange={handleChange} className="mr-2" />
                <label htmlFor="streamYes" className="text-foreground mr-4 cursor-pointer">
                  Yes
                </label>
                <input type="radio" id="streamNo" name="stream" value="false" checked={formData.stream === "false"} onChange={handleChange} className="mr-2" />
                <label htmlFor="streamNo" className="text-foreground cursor-pointer">
                  No
                </label>
              </div>
            </div> } 
              */}
          </form>
        </div>
        <div className="mt-4 space-y-8 p-8 rounded-lg shadow-md   ">
          {Object.keys(songsData).map((index: any) => (
            <MusicDataNftForm
              key={index}
              index={index}
              song={songsData[index]}
              setterFunction={handleFilesSelected}
              swapFunction={swapSongs}></MusicDataNftForm>
          ))}
        </div>
        <Button className={"my-4 border border-sky-400 hover:shadow-inner hover:shadow-sky-400"} onClick={handleAddMoreSongs}>
          {" "}
          Add more songs
        </Button>
      </div>
      {!manifestCid ? (
        <button onClick={generateManifestFile} disabled={progressBar > 0} className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600">
          Upload
        </button>
      ) : (
        <div>
          <div className="flex flex-col items-center justify-center p-8">
            <ToolTip tooltip="It might take more than 10 min for the files to get pinned and to be visible">
              <div className="flex flex-col justify-center items-center gap-4">
                <div className="text-green-400 flex flex-row gap-4">
                  Success:
                  <a href={"https://ipfs.io/" + manifestCid} target="_blank" className="font-semibold underline text-blue-500">
                    {"https://ipfs.io/" + manifestCid}
                  </a>
                  <CopyIcon onClick={() => copyLink("https://ipfs.io/" + manifestCid)} className="h-5 w-5 cursor-pointer text-blue-500"></CopyIcon>
                </div>
                <div className="text-green-400 flex flex-row gap-4">
                  {manifestCid}
                  <CopyIcon onClick={() => copyLink(manifestCid)} className="h-5 w-5 cursor-pointer text-blue-500"></CopyIcon>
                </div>
              </div>
            </ToolTip>

            <div className="mt-4 mx-auto">
              <ToolTip
                tooltip=""
                tooltipBox={
                  <div className="w-[400px] relative z-10 p-4 text-sm leading-relaxed text-white bg-gradient-to-b from-sky-500/20 via-[#300171]/20 to-black/20 rounded-3xl shadow-xl">
                    <ol className="list-decimal ml-4">
                      <p>To point a subdomain to your IPFS file after generating its hash via zStorage, follow these refined steps:</p>
                      <li>
                        <p>Access Domain Controller: Open the control panel of your domain provider.</p>
                      </li>
                      <li>
                        <p>
                          CNAME Record Setup: Add a CNAME record for your domain. Specify the subdomain you wish to use. Point this subdomain to a public IPFS
                          gateway, such as "ipfs.namebase.io."
                        </p>
                      </li>
                      <li>
                        <p>Obtain IPFS Manifest Hash: Retrieve the IPFS manifest hash from your zStorage.</p>
                      </li>
                      <li>
                        <p>
                          DNSLink TXT Record: Create a new TXT record. Name it _dnslink.yoursubdomain and set its value to dnslink=/ipfs/"IPFS manifest file
                          hash."
                        </p>
                      </li>
                      <li>
                        <p>This will effectively link your subdomain to the IPFS file using DNS records.</p>
                      </li>
                    </ol>
                  </div>
                }>
                <div className="bg-sky-500 w-34 h-12  rounded-full  blur-xl opacity-50"> </div>
                <div className="z-10 text-xl flex flex-row items-center justify-center -mt-8 ">
                  What's next ? <InfoIcon className=" scale-75"></InfoIcon>
                </div>
              </ToolTip>
            </div>
          </div>
        </div>
      )}
      <Toaster
        position="top-right"
        reverseOrder={false}
        toastOptions={{
          className: "",
          duration: 5000,
          style: {
            background: "#363636",
            color: "#fff",
          },
          success: {
            duration: 3000,
          },
        }}
      />
      <ProgressBar progress={progressBar} />
    </div>
  );
};
